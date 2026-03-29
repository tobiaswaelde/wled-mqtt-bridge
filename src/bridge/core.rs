use std::sync::Arc;

use anyhow::{bail, Context, Result};
use reqwest::Client;
use rumqttc::{AsyncClient, QoS};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config::{PollingConfig, PublishConfig},
    metrics::BridgeMetrics,
};

#[derive(Debug, Clone)]
pub(super) struct Topics {
    pub(super) cmd: String,
    pub(super) online: String,
    pub(super) state: String,
    pub(super) info: String,
    pub(super) effects: String,
    pub(super) palettes: String,
}

impl Topics {
    pub(super) fn for_controller(base: &str, controller_id: &str) -> Self {
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
pub(super) enum TopicClass {
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
pub(super) struct ControllerRuntime {
    pub(super) id: String,
    pub(super) wled_base: String,
    pub(super) topics: Arc<Topics>,
    pub(super) polling: PollingConfig,
    pub(super) http_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub(super) struct CommandMessage {
    pub(super) controller_id: String,
    pub(super) source_topic: String,
    pub(super) payload: String,
}

#[derive(Debug, Clone)]
pub(super) struct DeadLetterMessage {
    pub(super) reason: String,
    pub(super) controller_id: Option<String>,
    pub(super) source_topic: Option<String>,
    pub(super) payload: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub(super) enum WledCommand {
    SetState { state: Value },
    GetState,
    GetInfo,
    GetEffects,
    GetPalettes,
}

pub(super) async fn publish_json_with_keys(
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

pub(super) async fn publish_dead_letter(
    mqtt: &AsyncClient,
    publish_config: &PublishConfig,
    metrics: &BridgeMetrics,
    dead_letter_topic: &str,
    message: DeadLetterMessage,
) -> Result<()> {
    metrics.inc_dead_letter();
    // Dead-letter payload keeps enough context to replay/debug invalid commands.
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

pub(super) async fn publish_topic(
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

pub(super) fn qos_from_u8(value: u8) -> QoS {
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

pub(super) async fn handle_http_get(
    http: &Client,
    base: &str,
    path: &str,
    timeout_ms: Option<u64>,
) -> Result<Value> {
    let url = format!("{base}{path}");
    let mut request = http.get(&url);
    if let Some(timeout_ms) = timeout_ms {
        request = request.timeout(std::time::Duration::from_millis(timeout_ms));
    }
    let response = request
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

pub(super) async fn handle_http_post(
    http: &Client,
    base: &str,
    path: &str,
    body: &Value,
    timeout_ms: Option<u64>,
) -> Result<()> {
    let url = format!("{base}{path}");
    let mut request = http.post(&url).json(body);
    if let Some(timeout_ms) = timeout_ms {
        request = request.timeout(std::time::Duration::from_millis(timeout_ms));
    }
    let response = request
        .send()
        .await
        .with_context(|| format!("POST {path} failed"))?;

    let status = response.status();
    if !status.is_success() {
        bail!("POST {path} failed with status {status}");
    }

    Ok(())
}

pub(super) fn normalize_wled_base_url(raw: &str) -> String {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.trim_end_matches('/').to_string()
    } else {
        format!("http://{}", raw.trim_end_matches('/'))
    }
}

pub(super) fn extract_controller_id(base_topic: &str, topic: &str) -> Option<String> {
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
