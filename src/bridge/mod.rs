use std::{collections::HashMap, sync::Arc};

use anyhow::{Context, Result};
use reqwest::Client;
use rumqttc::{AsyncClient, Event, Incoming, LastWill, MqttOptions, Outgoing, Transport};
use tokio::{sync::mpsc, time};
use tracing::{debug, error, info, warn};

use crate::{config::AppConfig, metrics::BridgeMetrics};

mod core;
use core::{
    extract_controller_id, handle_http_get, handle_http_post, normalize_wled_base_url,
    publish_dead_letter, publish_topic, qos_from_u8, CommandMessage, ControllerRuntime,
    DeadLetterMessage, TopicClass, Topics, WledCommand,
};

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
    mqtt.subscribe(cmd_wildcard, rumqttc::QoS::AtMostOnce)
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
        // Adaptive polling: after sustained failures we back off to timeout_duration_ms,
        // otherwise we keep the normal interval for responsive updates.
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
            handle_http_post(http, &controller.wled_base, "/json/state", &state).await?;
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
    let value = handle_http_get(http, &controller.wled_base, "/json/state").await?;
    core::publish_json_with_keys(
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
    let value = handle_http_get(http, &controller.wled_base, "/json/info").await?;
    core::publish_json_with_keys(
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
    let value = handle_http_get(http, &controller.wled_base, "/json/eff").await?;
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
    let value = handle_http_get(http, &controller.wled_base, "/json/pal").await?;
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
