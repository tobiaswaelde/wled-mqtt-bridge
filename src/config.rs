use std::{collections::HashSet, fs, path::Path};

use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub mqtt: MqttConfig,
    pub wled: WledConfig,
    #[serde(default)]
    pub polling: PollingConfig,
    #[serde(default)]
    pub publish: PublishConfig,
    #[serde(default)]
    pub logging: LoggingConfig,
}

impl AppConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let raw = fs::read_to_string(path)
            .with_context(|| format!("failed to read config file {}", path.display()))?;

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let config = match ext.as_str() {
            "yaml" | "yml" => serde_yaml::from_str(&raw)
                .with_context(|| format!("failed to parse config file {}", path.display()))?,
            "json" => serde_json::from_str(&raw)
                .with_context(|| format!("failed to parse config file {}", path.display()))?,
            _ => bail!("unsupported config extension for {}", path.display()),
        };

        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        if self.mqtt.host.trim().is_empty() {
            bail!("mqtt.host cannot be empty");
        }

        if self.mqtt.base_topic.trim().is_empty() {
            bail!("mqtt.base_topic cannot be empty");
        }

        let controllers = &self.wled.controllers;
        if controllers.is_empty() {
            bail!("wled.controllers must contain at least one controller");
        }

        let mut ids = HashSet::new();
        for controller in controllers {
            if controller.id.trim().is_empty() {
                bail!("wled controller id cannot be empty");
            }

            if controller.id.contains('/') {
                bail!("wled controller id '{}' cannot contain '/'", controller.id);
            }

            if controller.host.trim().is_empty() {
                bail!("wled controller '{}' host cannot be empty", controller.id);
            }

            if !ids.insert(controller.id.clone()) {
                bail!("duplicate wled controller id '{}'", controller.id);
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct MqttConfig {
    #[serde(default = "default_mqtt_protocol")]
    pub protocol: String,
    pub host: String,
    #[serde(default = "default_mqtt_port")]
    pub port: u16,
    #[serde(default = "default_client_id")]
    pub client_id: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default = "default_base_topic")]
    pub base_topic: String,
    #[serde(default = "default_keep_alive_secs")]
    pub keep_alive_secs: u64,
    #[serde(default = "default_reconnect_delay_secs")]
    pub reconnect_delay_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WledConfig {
    pub controllers: Vec<WledControllerConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WledControllerConfig {
    pub id: String,
    pub host: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PollingConfig {
    #[serde(default = "default_poll_interval_ms")]
    pub interval_ms: u64,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_timeout_duration_ms")]
    pub timeout_duration_ms: u64,
}

impl Default for PollingConfig {
    fn default() -> Self {
        Self {
            interval_ms: default_poll_interval_ms(),
            timeout_ms: default_timeout_ms(),
            timeout_duration_ms: default_timeout_duration_ms(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PublishConfig {
    #[serde(default = "default_true")]
    pub json_object: bool,
    #[serde(default = "default_true")]
    pub json_keys: bool,
}

impl Default for PublishConfig {
    fn default() -> Self {
        Self {
            json_object: true,
            json_keys: true,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingConfig {
    #[serde(default = "default_log_level")]
    pub level: String,
    #[serde(default)]
    pub json: bool,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            json: false,
        }
    }
}

fn default_mqtt_protocol() -> String {
    "mqtt".to_string()
}

fn default_mqtt_port() -> u16 {
    1883
}

fn default_client_id() -> String {
    format!("wled-mqtt-bridge-{}", uuid::Uuid::new_v4())
}

fn default_base_topic() -> String {
    "wled".to_string()
}

fn default_keep_alive_secs() -> u64 {
    30
}

fn default_reconnect_delay_secs() -> u64 {
    5
}

fn default_poll_interval_ms() -> u64 {
    1000
}

fn default_timeout_ms() -> u64 {
    30000
}

fn default_timeout_duration_ms() -> u64 {
    30000
}

fn default_true() -> bool {
    true
}

fn default_log_level() -> String {
    "info".to_string()
}
