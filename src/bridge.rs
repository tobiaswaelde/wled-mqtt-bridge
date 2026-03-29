use std::{collections::HashMap, sync::Arc};

use anyhow::{bail, Context, Result};
use reqwest::Client;
use rumqttc::{AsyncClient, Event, Incoming, LastWill, MqttOptions, Outgoing, QoS, Transport};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::{sync::mpsc, time};
use tracing::{debug, error, info, warn};

use crate::{
    config::{AppConfig, PollingConfig, PublishConfig},
    metrics::BridgeMetrics,
};

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

#[derive(Debug, Clone, Copy)]
enum TopicClass {
    State,
    Info,
    Effects,
    Palettes,
    Online,
    BridgeOnline,
    CmdReset,
    DeadLetter,
}

#[derive(Debug, Clone)]
struct ControllerRuntime {
    id: String,
    wled_base: String,
    topics: Arc<Topics>,
    polling: PollingConfig,
}

#[derive(Debug, Clone)]
struct CommandMessage {
    controller_id: String,
    source_topic: String,
    payload: String,
}

#[derive(Debug, Clone)]
struct DeadLetterMessage {
    reason: String,
    controller_id: Option<String>,
    source_topic: Option<String>,
    payload: Option<String>,
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

pub async fn run(config: AppConfig, metrics: Arc<BridgeMetrics>) -> Result<()> {
    let controllers = config.wled.controllers.clone();
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
                polling: config.polling_for_controller(controller),
            };
            (controller.id.clone(), runtime)
        })
        .collect();

    let controller_map = Arc::new(controller_map);
    let http = Client::new();

    let dead_letter_topic = format!(
        "{}/{}",
        config.mqtt.base_topic, config.mqtt.dead_letter_suffix
    );

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
        qos_from_u8(config.publish.qos.bridge_online),
        config.publish.retain.bridge_online,
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

    publish_topic(
        &mqtt,
        &config.publish,
        &metrics,
        TopicClass::BridgeOnline,
        format!("{}/bridge_online", config.mqtt.base_topic),
        "true",
    )
    .await
    .context("failed to publish bridge_online=true")?;

    let (cmd_tx, mut cmd_rx) = mpsc::channel::<CommandMessage>(256);
    let mqtt_for_events = mqtt.clone();
    let reconnect_delay = config.mqtt.reconnect_delay_secs;
    let base_topic = config.mqtt.base_topic.clone();
    let publish_for_events = config.publish.clone();
    let metrics_for_events = metrics.clone();
    let dead_letter_for_events = dead_letter_topic.clone();

    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("mqtt connected");
                    metrics_for_events.inc_mqtt_connack();
                    if let Err(err) = publish_topic(
                        &mqtt_for_events,
                        &publish_for_events,
                        &metrics_for_events,
                        TopicClass::BridgeOnline,
                        format!("{base_topic}/bridge_online"),
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
                                source_topic: packet.topic,
                                payload,
                            };
                            if let Err(err) = cmd_tx.send(message).await {
                                warn!(?err, "failed to enqueue command");
                            }
                        }
                    } else if packet.topic.starts_with(&format!("{base_topic}/"))
                        && packet.topic.ends_with("/cmd")
                    {
                        let payload = String::from_utf8_lossy(&packet.payload).to_string();
                        let _ = publish_dead_letter(
                            &mqtt_for_events,
                            &publish_for_events,
                            &metrics_for_events,
                            &dead_letter_for_events,
                            DeadLetterMessage {
                                reason: "invalid_command_topic".to_string(),
                                controller_id: None,
                                source_topic: Some(packet.topic),
                                payload: Some(payload),
                            },
                        )
                        .await;
                    }
                }
                Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                    warn!("mqtt disconnected");
                }
                Ok(_) => {}
                Err(err) => {
                    metrics_for_events.inc_mqtt_eventloop_error();
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
    let metrics_for_cmds = metrics.clone();
    let dead_letter_for_cmds = dead_letter_topic.clone();

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
                    &metrics_for_cmds,
                    &cmd.payload,
                )
                .await;

                if let Err(err) = result {
                    metrics_for_cmds.inc_command_error();
                    error!(
                        controller_id = %controller.id,
                        ?err,
                        "failed to handle command"
                    );

                    let _ = publish_dead_letter(
                        &mqtt_for_cmds,
                        &config_for_cmds.publish,
                        &metrics_for_cmds,
                        &dead_letter_for_cmds,
                        DeadLetterMessage {
                            reason: "command_handler_error".to_string(),
                            controller_id: Some(controller.id.clone()),
                            source_topic: Some(cmd.source_topic.clone()),
                            payload: Some(cmd.payload.clone()),
                        },
                    )
                    .await;
                }

                if let Err(err) = publish_topic(
                    &mqtt_for_cmds,
                    &config_for_cmds.publish,
                    &metrics_for_cmds,
                    TopicClass::CmdReset,
                    controller.topics.cmd.clone(),
                    "",
                )
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
                let _ = publish_dead_letter(
                    &mqtt_for_cmds,
                    &config_for_cmds.publish,
                    &metrics_for_cmds,
                    &dead_letter_for_cmds,
                    DeadLetterMessage {
                        reason: "unknown_controller_id".to_string(),
                        controller_id: Some(cmd.controller_id.clone()),
                        source_topic: Some(cmd.source_topic.clone()),
                        payload: Some(cmd.payload.clone()),
                    },
                )
                .await;
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
            polling: config.polling_for_controller(&controller),
        };

        let mqtt_for_poll = mqtt.clone();
        let config_for_poll = config.clone();
        let http_for_poll = http.clone();
        let metrics_for_poll = metrics.clone();

        tokio::spawn(async move {
            run_controller_poll_loop(
                mqtt_for_poll,
                http_for_poll,
                controller,
                config_for_poll,
                metrics_for_poll,
            )
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
    metrics: Arc<BridgeMetrics>,
) {
    time::sleep(std::time::Duration::from_secs(5)).await;

    if let Err(err) = publish_effects(&mqtt, &http, &controller, &config, &metrics).await {
        warn!(
            controller_id = %controller.id,
            ?err,
            "failed to fetch/publish initial effects"
        );
    }

    if let Err(err) = publish_palettes(&mqtt, &http, &controller, &config, &metrics).await {
        warn!(
            controller_id = %controller.id,
            ?err,
            "failed to fetch/publish initial palettes"
        );
    }

    let mut first_fail_at: Option<time::Instant> = None;

    loop {
        let delay_ms = if let Some(failed_at) = first_fail_at {
            if failed_at.elapsed().as_millis() >= u128::from(controller.polling.timeout_ms) {
                controller.polling.timeout_duration_ms
            } else {
                controller.polling.interval_ms
            }
        } else {
            controller.polling.interval_ms
        };

        time::sleep(std::time::Duration::from_millis(delay_ms)).await;

        let state_result = publish_state(&mqtt, &http, &controller, &config, &metrics).await;
        let info_result = publish_info(&mqtt, &http, &controller, &config, &metrics).await;

        if state_result.is_ok() && info_result.is_ok() {
            if first_fail_at.is_some() {
                info!(controller_id = %controller.id, "wled connection restored");
            }
            first_fail_at = None;

            if let Err(err) = publish_topic(
                &mqtt,
                &config.publish,
                &metrics,
                TopicClass::Online,
                controller.topics.online.clone(),
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

            if let Err(err) = publish_topic(
                &mqtt,
                &config.publish,
                &metrics,
                TopicClass::Online,
                controller.topics.online.clone(),
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
                metrics.inc_wled_poll_error();
                warn!(controller_id = %controller.id, ?err, "poll state failed");
            }
            if let Err(err) = info_result {
                metrics.inc_wled_poll_error();
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
    metrics: &BridgeMetrics,
    payload: &str,
) -> Result<()> {
    let command: WledCommand = serde_json::from_str(payload).context("invalid command payload")?;

    match command {
        WledCommand::SetState { state } => {
            post_json(http, &controller.wled_base, "/json/state", &state).await?;
            publish_state(mqtt, http, controller, config, metrics).await?;
        }
        WledCommand::GetState => {
            publish_state(mqtt, http, controller, config, metrics).await?;
        }
        WledCommand::GetInfo => {
            publish_info(mqtt, http, controller, config, metrics).await?;
        }
        WledCommand::GetEffects => {
            publish_effects(mqtt, http, controller, config, metrics).await?;
        }
        WledCommand::GetPalettes => {
            publish_palettes(mqtt, http, controller, config, metrics).await?;
        }
    }

    Ok(())
}

async fn publish_state(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
    metrics: &BridgeMetrics,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/state").await?;
    publish_json_with_keys(
        mqtt,
        &config.publish,
        metrics,
        &controller.topics.state,
        TopicClass::State,
        &value,
    )
    .await
}

async fn publish_info(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
    metrics: &BridgeMetrics,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/info").await?;
    publish_json_with_keys(
        mqtt,
        &config.publish,
        metrics,
        &controller.topics.info,
        TopicClass::Info,
        &value,
    )
    .await
}

async fn publish_effects(
    mqtt: &AsyncClient,
    http: &Client,
    controller: &ControllerRuntime,
    config: &AppConfig,
    metrics: &BridgeMetrics,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/eff").await?;
    publish_topic(
        mqtt,
        &config.publish,
        metrics,
        TopicClass::Effects,
        controller.topics.effects.clone(),
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
    config: &AppConfig,
    metrics: &BridgeMetrics,
) -> Result<()> {
    let value = get_json(http, &controller.wled_base, "/json/pal").await?;
    publish_topic(
        mqtt,
        &config.publish,
        metrics,
        TopicClass::Palettes,
        controller.topics.palettes.clone(),
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
    publish_config: &PublishConfig,
    metrics: &BridgeMetrics,
    topic: &str,
    class: TopicClass,
    value: &Value,
) -> Result<()> {
    if publish_config.json_object {
        publish_topic(
            mqtt,
            publish_config,
            metrics,
            class,
            topic.to_string(),
            serde_json::to_vec(value)?,
        )
        .await
        .with_context(|| format!("failed to publish {topic}"))?;
    }

    if publish_config.json_keys {
        let mut paths = Vec::new();
        collect_paths(value, "", &mut paths);

        for (path, payload) in paths {
            publish_topic(
                mqtt,
                publish_config,
                metrics,
                class,
                format!("{topic}/{path}"),
                payload,
            )
            .await
            .with_context(|| format!("failed to publish {topic}/{path}"))?;
        }
    }

    Ok(())
}

async fn publish_dead_letter(
    mqtt: &AsyncClient,
    publish_config: &PublishConfig,
    metrics: &BridgeMetrics,
    dead_letter_topic: &str,
    message: DeadLetterMessage,
) -> Result<()> {
    metrics.inc_dead_letter();
    let body = json!({
        "reason": message.reason,
        "controller_id": message.controller_id,
        "source_topic": message.source_topic,
        "payload": message.payload,
    });

    publish_topic(
        mqtt,
        publish_config,
        metrics,
        TopicClass::DeadLetter,
        dead_letter_topic.to_string(),
        serde_json::to_vec(&body)?,
    )
    .await
}

async fn publish_topic(
    mqtt: &AsyncClient,
    publish_config: &PublishConfig,
    metrics: &BridgeMetrics,
    class: TopicClass,
    topic: String,
    payload: impl Into<Vec<u8>>,
) -> Result<()> {
    let (qos, retain) = qos_retain_for_class(publish_config, class);
    mqtt.publish(topic, qos, retain, payload.into())
        .await
        .inspect_err(|_err| {
            metrics.inc_mqtt_publish_error();
        })
        .context("mqtt publish failed")
}

fn qos_retain_for_class(publish_config: &PublishConfig, class: TopicClass) -> (QoS, bool) {
    let (qos, retain) = match class {
        TopicClass::State => (publish_config.qos.state, publish_config.retain.state),
        TopicClass::Info => (publish_config.qos.info, publish_config.retain.info),
        TopicClass::Effects => (publish_config.qos.effects, publish_config.retain.effects),
        TopicClass::Palettes => (publish_config.qos.palettes, publish_config.retain.palettes),
        TopicClass::Online => (publish_config.qos.online, publish_config.retain.online),
        TopicClass::BridgeOnline => (
            publish_config.qos.bridge_online,
            publish_config.retain.bridge_online,
        ),
        TopicClass::CmdReset => (
            publish_config.qos.cmd_reset,
            publish_config.retain.cmd_reset,
        ),
        TopicClass::DeadLetter => (
            publish_config.qos.dead_letter,
            publish_config.retain.dead_letter,
        ),
    };

    (qos_from_u8(qos), retain)
}

fn qos_from_u8(value: u8) -> QoS {
    match value {
        0 => QoS::AtMostOnce,
        1 => QoS::AtLeastOnce,
        2 => QoS::ExactlyOnce,
        _ => QoS::AtMostOnce,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn extract_controller_id_parses_valid_topic() {
        let id = extract_controller_id("wled", "wled/living-room/cmd");
        assert_eq!(id.as_deref(), Some("living-room"));
    }

    #[test]
    fn extract_controller_id_rejects_non_cmd_topics() {
        assert!(extract_controller_id("wled", "wled/living-room/state").is_none());
        assert!(extract_controller_id("wled", "other/living-room/cmd").is_none());
        assert!(extract_controller_id("wled", "wled/living/room/cmd").is_none());
    }

    #[test]
    fn collect_paths_flattens_nested_values_and_arrays() {
        let value = json!({
            "on": true,
            "bri": 128,
            "seg": [{"id": 0, "fx": 5}],
            "nested": {
                "label": "desk"
            }
        });

        let mut pairs = Vec::new();
        collect_paths(&value, "", &mut pairs);
        let map: HashMap<String, String> = pairs.into_iter().collect();

        assert_eq!(map.get("on"), Some(&"true".to_string()));
        assert_eq!(map.get("bri"), Some(&"128".to_string()));
        assert_eq!(map.get("seg"), Some(&r#"[{"fx":5,"id":0}]"#.to_string()));
        assert_eq!(map.get("nested/label"), Some(&"desk".to_string()));
    }

    #[test]
    fn qos_from_u8_maps_values() {
        assert!(matches!(qos_from_u8(0), QoS::AtMostOnce));
        assert!(matches!(qos_from_u8(1), QoS::AtLeastOnce));
        assert!(matches!(qos_from_u8(2), QoS::ExactlyOnce));
        assert!(matches!(qos_from_u8(9), QoS::AtMostOnce));
    }
}
