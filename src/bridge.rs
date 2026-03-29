use std::{collections::HashMap, sync::Arc};

use anyhow::{bail, Context, Result};
use reqwest::Client;
use rumqttc::{AsyncClient, Event, Incoming, LastWill, MqttOptions, Outgoing, QoS, Transport};
use serde::Deserialize;
use serde_json::Value;
use tokio::{sync::mpsc, time};
use tracing::{debug, error, info, warn};

use crate::config::AppConfig;

#[derive(Debug, Clone)]
struct Topics {
    cmd: String,
    online: String,
    state: String,
    info: String,
    effects: String,
    palettes: String,
}

impl Topics {
    fn for_controller(base: &str, controller_id: &str) -> Self {
        let root = format!("{base}/{controller_id}");
        Self {
            cmd: format!("{root}/cmd"),
            online: format!("{root}/online"),
            state: format!("{root}/state"),
            info: format!("{root}/info"),
            effects: format!("{root}/effects"),
            palettes: format!("{root}/palettes"),
        }
    }
}

#[derive(Debug, Clone)]
struct ControllerRuntime {
    id: String,
    wled_base: String,
    topics: Arc<Topics>,
}

#[derive(Debug, Clone)]
struct CommandMessage {
    controller_id: String,
    payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum WledCommand {
    SetState { state: Value },
    GetState,
    GetInfo,
    GetEffects,
    GetPalettes,
}

pub async fn run(config: AppConfig) -> Result<()> {
    let controllers = config.wled.controllers();
    let controller_map: HashMap<String, ControllerRuntime> = controllers
        .iter()
        .map(|controller| {
            let runtime = ControllerRuntime {
                id: controller.id.clone(),
                wled_base: normalize_wled_base_url(&controller.host),
                topics: Arc::new(Topics::for_controller(
                    &config.mqtt.base_topic,
                    &controller.id,
                )),
            };
            (controller.id.clone(), runtime)
        })
        .collect();

    let controller_map = Arc::new(controller_map);
    let http = Client::new();

    let mut mqtt_options = MqttOptions::new(
        config.mqtt.client_id.clone(),
        config.mqtt.host.clone(),
        config.mqtt.port,
    );
    mqtt_options.set_keep_alive(std::time::Duration::from_secs(config.mqtt.keep_alive_secs));
    mqtt_options.set_clean_session(false);
    mqtt_options.set_last_will(LastWill::new(
        format!("{}/bridge_online", config.mqtt.base_topic),
        "false",
        QoS::AtLeastOnce,
        true,
    ));

    if config.mqtt.protocol.eq_ignore_ascii_case("mqtts") {
        mqtt_options.set_transport(Transport::tls_with_default_config());
    }

    if let Some(username) = &config.mqtt.username {
        mqtt_options.set_credentials(username, config.mqtt.password.clone().unwrap_or_default());
    }

    let (mqtt, mut eventloop) = AsyncClient::new(mqtt_options, 200);
    let cmd_wildcard = format!("{}/+/cmd", config.mqtt.base_topic);
    mqtt.subscribe(cmd_wildcard, QoS::AtMostOnce)
        .await
        .context("failed to subscribe to command wildcard topic")?;

    mqtt.publish(
        format!("{}/bridge_online", config.mqtt.base_topic),
        QoS::AtLeastOnce,
        true,
        "true",
    )
    .await
    .context("failed to publish bridge_online=true")?;

    let (cmd_tx, mut cmd_rx) = mpsc::channel::<CommandMessage>(256);
    let mqtt_for_events = mqtt.clone();
    let reconnect_delay = config.mqtt.reconnect_delay_secs;
    let base_topic = config.mqtt.base_topic.clone();

    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("mqtt connected");
                    if let Err(err) = mqtt_for_events
                        .publish(
                            format!("{base_topic}/bridge_online"),
                            QoS::AtLeastOnce,
                            true,
                            "true",
                        )
                        .await
                    {
                        warn!(?err, "failed to publish bridge_online=true");
                    }
                }
                Ok(Event::Incoming(Incoming::Publish(packet))) => {
                    if let Some(controller_id) = extract_controller_id(&base_topic, &packet.topic) {
                        let payload = String::from_utf8_lossy(&packet.payload).to_string();
                        if !payload.trim().is_empty() {
                            let message = CommandMessage {
                                controller_id,
                                payload,
                            };
                            if let Err(err) = cmd_tx.send(message).await {
                                warn!(?err, "failed to enqueue command");
                            }
                        }
                    }
                }
                Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                    warn!("mqtt disconnected");
                }
                Ok(_) => {}
                Err(err) => {
                    warn!(?err, "mqtt eventloop error");
                    time::sleep(std::time::Duration::from_secs(reconnect_delay.max(1))).await;
                }
            }
        }
    });

    let mqtt_for_cmds = mqtt.clone();
    let config_for_cmds = config.clone();
    let http_for_cmds = http.clone();
    let controllers_for_cmds = controller_map.clone();

    tokio::spawn(async move {
        while let Some(cmd) = cmd_rx.recv().await {
            debug!(
                controller_id = %cmd.controller_id,
                message = %cmd.payload,
                "received command payload"
            );

            if let Some(controller) = controllers_for_cmds.get(&cmd.controller_id) {
                let result = handle_command(
                    &mqtt_for_cmds,
                    &http_for_cmds,
                    controller,
                    &config_for_cmds,
                    &cmd.payload,
                )
                .await;

                if let Err(err) = result {
                    error!(
                        controller_id = %controller.id,
                        ?err,
                        "failed to handle command"
                    );
                }

                if let Err(err) = mqtt_for_cmds
                    .publish(controller.topics.cmd.clone(), QoS::AtMostOnce, false, "")
                    .await
                {
                    warn!(
                        controller_id = %controller.id,
                        ?err,
                        "failed to reset command topic"
                    );
                }
            } else {
                warn!(controller_id = %cmd.controller_id, "unknown controller id in command topic");
            }
        }
    });

    for controller in controllers {
        let controller = ControllerRuntime {
            id: controller.id.clone(),
            wled_base: normalize_wled_base_url(&controller.host),
            topics: Arc::new(Topics::for_controller(
                &config.mqtt.base_topic,
                &controller.id,
            )),
        };

        let mqtt_for_poll = mqtt.clone();
        let config_for_poll = config.clone();
        let http_for_poll = http.clone();

        tokio::spawn(async move {
            run_controller_poll_loop(mqtt_for_poll, http_for_poll, controller, config_for_poll)
                .await;
        });
    }

    tokio::signal::ctrl_c()
        .await
        .context("signal handler failed")?;
    info!("shutdown signal received");

    Ok(())
}

async fn run_controller_poll_loop(
    mqtt: AsyncClient,
    http: Client,
    controller: ControllerRuntime,
    config: AppConfig,
) {
    time::sleep(std::time::Duration::from_secs(5)).await;

    if let Err(err) = publish_effects(&mqtt, &http, &controller, &config).await {
        warn!(
            controller_id = %controller.id,
            ?err,
            "failed to fetch/publish initial effects"
        );
    }

    if let Err(err) = publish_palettes(&mqtt, &http, &controller, &config).await {
        warn!(
            controller_id = %controller.id,
            ?err,
            "failed to fetch/publish initial palettes"
        );
    }

    let mut first_fail_at: Option<time::Instant> = None;

    loop {
        let delay_ms = if let Some(failed_at) = first_fail_at {
            if failed_at.elapsed().as_millis() >= u128::from(config.polling.timeout_ms) {
                config.polling.timeout_duration_ms
            } else {
                config.polling.interval_ms
            }
        } else {
            config.polling.interval_ms
        };

        time::sleep(std::time::Duration::from_millis(delay_ms)).await;

        let state_result = publish_state(&mqtt, &http, &controller, &config).await;
        let info_result = publish_info(&mqtt, &http, &controller, &config).await;

        if state_result.is_ok() && info_result.is_ok() {
            if first_fail_at.is_some() {
                info!(controller_id = %controller.id, "wled connection restored");
            }
            first_fail_at = None;

            if let Err(err) = mqtt
                .publish(
                    controller.topics.online.clone(),
                    QoS::AtLeastOnce,
                    true,
                    "true",
                )
                .await
            {
                warn!(
                    controller_id = %controller.id,
                    ?err,
                    "failed to publish online=true"
                );
            }
        } else {
            if first_fail_at.is_none() {
                first_fail_at = Some(time::Instant::now());
            }

            if let Err(err) = mqtt
                .publish(
                    controller.topics.online.clone(),
                    QoS::AtLeastOnce,
                    true,
                    "false",
                )
                .await
            {
                warn!(
                    controller_id = %controller.id,
                    ?err,
                    "failed to publish online=false"
                );
            }

            if let Err(err) = state_result {
                warn!(controller_id = %controller.id, ?err, "poll state failed");
            }
            if let Err(err) = info_result {
                warn!(controller_id = %controller.id, ?err, "poll info failed");
            }
        }
    }
}

async fn handle_command(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
    payload: &str,
) -> Result<()> {
    let command: WledCommand = serde_json::from_str(payload).context("invalid command payload")?;

    match command {
        WledCommand::SetState { state } => {
            post_json(http, &controller.wled_base, "/json/state", &state).await?;
            publish_state(mqtt, http, controller, config).await?;
        }
        WledCommand::GetState => {
            publish_state(mqtt, http, controller, config).await?;
        }
        WledCommand::GetInfo => {
            publish_info(mqtt, http, controller, config).await?;
        }
        WledCommand::GetEffects => {
            publish_effects(mqtt, http, controller, config).await?;
        }
        WledCommand::GetPalettes => {
            publish_palettes(mqtt, http, controller, config).await?;
        }
    }

    Ok(())
}

async fn publish_state(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/state").await?;
    publish_json_with_keys(mqtt, &controller.topics.state, &value, config).await
}

async fn publish_info(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/info").await?;
    publish_json_with_keys(mqtt, &controller.topics.info, &value, config).await
}

async fn publish_effects(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    _config: &AppConfig,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/eff").await?;
    mqtt.publish(
        controller.topics.effects.clone(),
        QoS::AtMostOnce,
        false,
        serde_json::to_vec(&value)?,
    )
    .await
    .with_context(|| format!("failed to publish effects for controller {}", controller.id))?;
    Ok(())
}

async fn publish_palettes(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    _config: &AppConfig,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/pal").await?;
    mqtt.publish(
        controller.topics.palettes.clone(),
        QoS::AtMostOnce,
        false,
        serde_json::to_vec(&value)?,
    )
    .await
    .with_context(|| {
        format!(
            "failed to publish palettes for controller {}",
            controller.id
        )
    })?;
    Ok(())
}

async fn publish_json_with_keys(
    mqtt: &AsyncClient,
    topic: &str,
    value: &Value,
    config: &AppConfig,
) -> Result<()> {
    if config.publish.json_object {
        mqtt.publish(
            topic.to_string(),
            QoS::AtMostOnce,
            false,
            serde_json::to_vec(value)?,
        )
        .await
        .with_context(|| format!("failed to publish {topic}"))?;
    }

    if config.publish.json_keys {
        let mut paths = Vec::new();
        collect_paths(value, "", &mut paths);

        for (path, payload) in paths {
            mqtt.publish(format!("{topic}/{path}"), QoS::AtMostOnce, false, payload)
                .await
                .with_context(|| format!("failed to publish {topic}/{path}"))?;
        }
    }

    Ok(())
}

fn collect_paths(value: &Value, parent: &str, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            for (key, next) in map {
                let path = if parent.is_empty() {
                    key.to_string()
                } else {
                    format!("{parent}/{key}")
                };
                collect_paths(next, &path, out);
            }
        }
        Value::Array(array) => {
            let payload = serde_json::to_string(array).unwrap_or_else(|_| "[]".to_string());
            if !parent.is_empty() {
                out.push((parent.to_string(), payload));
            }
        }
        Value::String(v) => {
            if !parent.is_empty() {
                out.push((parent.to_string(), v.to_string()));
            }
        }
        Value::Bool(v) => {
            if !parent.is_empty() {
                out.push((parent.to_string(), v.to_string()));
            }
        }
        Value::Number(v) => {
            if !parent.is_empty() {
                out.push((parent.to_string(), v.to_string()));
            }
        }
        Value::Null => {
            if !parent.is_empty() {
                out.push((parent.to_string(), "null".to_string()));
            }
        }
    }
}

async fn get_json(http: &Client, base: &str, path: &str) -> Result<Value> {
    let url = format!("{base}{path}");
    let response = http
        .get(&url)
        .send()
        .await
        .with_context(|| format!("GET {path} failed"))?;
    let status = response.status();

    if !status.is_success() {
        bail!("GET {path} failed with status {status}");
    }

    response
        .json::<Value>()
        .await
        .with_context(|| format!("GET {path} returned invalid JSON"))
}

async fn post_json(http: &Client, base: &str, path: &str, body: &Value) -> Result<()> {
    let url = format!("{base}{path}");
    let response = http
        .post(&url)
        .json(body)
        .send()
        .await
        .with_context(|| format!("POST {path} failed"))?;

    let status = response.status();
    if !status.is_success() {
        bail!("POST {path} failed with status {status}");
    }

    Ok(())
}

fn normalize_wled_base_url(raw: &str) -> String {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.trim_end_matches('/').to_string()
    } else {
        format!("http://{}", raw.trim_end_matches('/'))
    }
}

fn extract_controller_id(base_topic: &str, topic: &str) -> Option<String> {
    let prefix = format!("{base_topic}/");
    let suffix = "/cmd";

    let without_prefix = topic.strip_prefix(&prefix)?;
    let controller_id = without_prefix.strip_suffix(suffix)?;

    if controller_id.is_empty() || controller_id.contains('/') {
        return None;
    }

    Some(controller_id.to_string())
}
