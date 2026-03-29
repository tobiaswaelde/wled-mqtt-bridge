use std::{collections::HashSet, fs, path::Path};

use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppConfig {
    pub mqtt: MqttConfig,
    pub wled: WledConfig,
    #[serde(default)]
    pub polling: PollingConfig,
    #[serde(default)]
    pub publish: PublishConfig,
    #[serde(default)]
    pub metrics: MetricsConfig,
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
        if self.mqtt.protocol.trim().is_empty() {
            bail!("mqtt.protocol cannot be empty");
        }

        if !matches!(
            self.mqtt.protocol.to_ascii_lowercase().as_str(),
            "mqtt" | "mqtts"
        ) {
            bail!("mqtt.protocol must be 'mqtt' or 'mqtts'");
        }

        if self.mqtt.host.trim().is_empty() {
            bail!("mqtt.host cannot be empty");
        }

        if self.mqtt.port == 0 {
            bail!("mqtt.port must be greater than 0");
        }

        if self.mqtt.client_id.trim().is_empty() {
            bail!("mqtt.client_id cannot be empty");
        }

        if self.mqtt.base_topic.trim().is_empty() {
            bail!("mqtt.base_topic cannot be empty");
        }

        if self.mqtt.dead_letter_suffix.trim().is_empty() {
            bail!("mqtt.dead_letter_suffix cannot be empty");
        }

        if self.mqtt.keep_alive_secs == 0 {
            bail!("mqtt.keep_alive_secs must be greater than 0");
        }

        if self.mqtt.reconnect_delay_secs == 0 {
            bail!("mqtt.reconnect_delay_secs must be greater than 0");
        }

        if self.mqtt.reconnect_max_delay_secs == 0 {
            bail!("mqtt.reconnect_max_delay_secs must be greater than 0");
        }

        if self.mqtt.reconnect_max_delay_secs < self.mqtt.reconnect_delay_secs {
            bail!("mqtt.reconnect_max_delay_secs must be >= mqtt.reconnect_delay_secs");
        }

        if self.polling.interval_ms == 0 {
            bail!("polling.interval_ms must be greater than 0");
        }

        if self.polling.timeout_ms == 0 {
            bail!("polling.timeout_ms must be greater than 0");
        }

        if self.polling.timeout_duration_ms == 0 {
            bail!("polling.timeout_duration_ms must be greater than 0");
        }

        if let Some(timeout_ms) = self.wled.http_timeout_ms {
            if timeout_ms == 0 {
                bail!("wled.http_timeout_ms must be greater than 0");
            }
        }

        if self.metrics.path.trim().is_empty() || !self.metrics.path.starts_with('/') {
            bail!("metrics.path must start with '/'");
        }

        if self.metrics.port == 0 {
            bail!("metrics.port must be greater than 0");
        }

        if self.logging.level.trim().is_empty() {
            bail!("logging.level cannot be empty");
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

            if let Some(interval_ms) = controller.interval_ms {
                if interval_ms == 0 {
                    bail!(
                        "wled controller '{}' interval_ms must be greater than 0",
                        controller.id
                    );
                }
            }

            if let Some(timeout_ms) = controller.timeout_ms {
                if timeout_ms == 0 {
                    bail!(
                        "wled controller '{}' timeout_ms must be greater than 0",
                        controller.id
                    );
                }
            }

            if let Some(timeout_duration_ms) = controller.timeout_duration_ms {
                if timeout_duration_ms == 0 {
                    bail!(
                        "wled controller '{}' timeout_duration_ms must be greater than 0",
                        controller.id
                    );
                }
            }

            if let Some(http_timeout_ms) = controller.http_timeout_ms {
                if http_timeout_ms == 0 {
                    bail!(
                        "wled controller '{}' http_timeout_ms must be greater than 0",
                        controller.id
                    );
                }
            }

            if !ids.insert(controller.id.clone()) {
                bail!("duplicate wled controller id '{}'", controller.id);
            }
        }

        self.publish.validate()?;

        Ok(())
    }

    pub fn polling_for_controller(&self, controller: &WledControllerConfig) -> PollingConfig {
        PollingConfig {
            interval_ms: controller.interval_ms.unwrap_or(self.polling.interval_ms),
            timeout_ms: controller.timeout_ms.unwrap_or(self.polling.timeout_ms),
            timeout_duration_ms: controller
                .timeout_duration_ms
                .unwrap_or(self.polling.timeout_duration_ms),
        }
    }

    pub fn http_timeout_ms_for_controller(&self, controller: &WledControllerConfig) -> Option<u64> {
        controller.http_timeout_ms.or(self.wled.http_timeout_ms)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
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
    #[serde(default = "default_dead_letter_suffix")]
    pub dead_letter_suffix: String,
    #[serde(default = "default_keep_alive_secs")]
    pub keep_alive_secs: u64,
    #[serde(default = "default_reconnect_delay_secs")]
    pub reconnect_delay_secs: u64,
    #[serde(default = "default_reconnect_max_delay_secs")]
    pub reconnect_max_delay_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WledConfig {
    #[serde(default)]
    pub http_timeout_ms: Option<u64>,
    pub controllers: Vec<WledControllerConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WledControllerConfig {
    pub id: String,
    pub host: String,
    #[serde(default)]
    pub interval_ms: Option<u64>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub timeout_duration_ms: Option<u64>,
    #[serde(default)]
    pub http_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct PublishConfig {
    #[serde(default = "default_true")]
    pub json_object: bool,
    #[serde(default = "default_true")]
    pub json_keys: bool,
    #[serde(default)]
    pub qos: QosConfig,
    #[serde(default)]
    pub retain: RetainConfig,
}

impl PublishConfig {
    fn validate(&self) -> Result<()> {
        for (name, value) in [
            ("state", self.qos.state),
            ("info", self.qos.info),
            ("effects", self.qos.effects),
            ("palettes", self.qos.palettes),
            ("online", self.qos.online),
            ("bridge_online", self.qos.bridge_online),
            ("cmd_reset", self.qos.cmd_reset),
            ("dead_letter", self.qos.dead_letter),
        ] {
            if value > 2 {
                bail!("publish.qos.{name} must be 0, 1, or 2");
            }
        }
        Ok(())
    }
}

impl Default for PublishConfig {
    fn default() -> Self {
        Self {
            json_object: true,
            json_keys: true,
            qos: QosConfig::default(),
            retain: RetainConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QosConfig {
    #[serde(default = "default_qos_0")]
    pub state: u8,
    #[serde(default = "default_qos_0")]
    pub info: u8,
    #[serde(default = "default_qos_0")]
    pub effects: u8,
    #[serde(default = "default_qos_0")]
    pub palettes: u8,
    #[serde(default = "default_qos_1")]
    pub online: u8,
    #[serde(default = "default_qos_1")]
    pub bridge_online: u8,
    #[serde(default = "default_qos_0")]
    pub cmd_reset: u8,
    #[serde(default = "default_qos_0")]
    pub dead_letter: u8,
}

impl Default for QosConfig {
    fn default() -> Self {
        Self {
            state: default_qos_0(),
            info: default_qos_0(),
            effects: default_qos_0(),
            palettes: default_qos_0(),
            online: default_qos_1(),
            bridge_online: default_qos_1(),
            cmd_reset: default_qos_0(),
            dead_letter: default_qos_0(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetainConfig {
    #[serde(default)]
    pub state: bool,
    #[serde(default)]
    pub info: bool,
    #[serde(default)]
    pub effects: bool,
    #[serde(default)]
    pub palettes: bool,
    #[serde(default = "default_true")]
    pub online: bool,
    #[serde(default = "default_true")]
    pub bridge_online: bool,
    #[serde(default)]
    pub cmd_reset: bool,
    #[serde(default)]
    pub dead_letter: bool,
}

impl Default for RetainConfig {
    fn default() -> Self {
        Self {
            state: false,
            info: false,
            effects: false,
            palettes: false,
            online: true,
            bridge_online: true,
            cmd_reset: false,
            dead_letter: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MetricsConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_metrics_host")]
    pub host: String,
    #[serde(default = "default_metrics_port")]
    pub port: u16,
    #[serde(default = "default_metrics_path")]
    pub path: String,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: default_metrics_host(),
            port: default_metrics_port(),
            path: default_metrics_path(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
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

fn default_dead_letter_suffix() -> String {
    "dead_letter".to_string()
}

fn default_keep_alive_secs() -> u64 {
    30
}

fn default_reconnect_delay_secs() -> u64 {
    5
}

fn default_reconnect_max_delay_secs() -> u64 {
    60
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

fn default_qos_0() -> u8 {
    0
}

fn default_qos_1() -> u8 {
    1
}

fn default_metrics_host() -> String {
    "0.0.0.0".to_string()
}

fn default_metrics_port() -> u16 {
    9090
}

fn default_metrics_path() -> String {
    "/metrics".to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> AppConfig {
        AppConfig {
            mqtt: MqttConfig {
                protocol: "mqtt".to_string(),
                host: "127.0.0.1".to_string(),
                port: 1883,
                client_id: "test-client".to_string(),
                username: None,
                password: None,
                base_topic: "wled".to_string(),
                dead_letter_suffix: "dead_letter".to_string(),
                keep_alive_secs: 30,
                reconnect_delay_secs: 5,
                reconnect_max_delay_secs: 60,
            },
            wled: WledConfig {
                http_timeout_ms: None,
                controllers: vec![
                    WledControllerConfig {
                        id: "living-room".to_string(),
                        host: "192.168.1.50".to_string(),
                        interval_ms: None,
                        timeout_ms: None,
                        timeout_duration_ms: None,
                        http_timeout_ms: None,
                    },
                    WledControllerConfig {
                        id: "office".to_string(),
                        host: "192.168.1.51".to_string(),
                        interval_ms: None,
                        timeout_ms: None,
                        timeout_duration_ms: None,
                        http_timeout_ms: None,
                    },
                ],
            },
            polling: PollingConfig::default(),
            publish: PublishConfig::default(),
            metrics: MetricsConfig::default(),
            logging: LoggingConfig::default(),
        }
    }

    #[test]
    fn validate_accepts_valid_config() {
        let cfg = valid_config();
        assert!(cfg.validate().is_ok());
    }

    #[test]
    fn validate_rejects_empty_controllers() {
        let mut cfg = valid_config();
        cfg.wled.controllers.clear();
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("wled.controllers"));
    }

    #[test]
    fn validate_rejects_duplicate_controller_ids() {
        let mut cfg = valid_config();
        cfg.wled.controllers[1].id = "living-room".to_string();
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("duplicate wled controller id"));
    }

    #[test]
    fn validate_rejects_controller_id_with_slash() {
        let mut cfg = valid_config();
        cfg.wled.controllers[0].id = "bad/id".to_string();
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("cannot contain '/'"));
    }

    #[test]
    fn validate_rejects_empty_controller_host() {
        let mut cfg = valid_config();
        cfg.wled.controllers[0].host = " ".to_string();
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("host cannot be empty"));
    }

    #[test]
    fn validate_rejects_invalid_qos() {
        let mut cfg = valid_config();
        cfg.publish.qos.state = 3;
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("publish.qos.state"));
    }

    #[test]
    fn controller_polling_overrides_global_values() {
        let mut cfg = valid_config();
        cfg.polling.interval_ms = 1000;
        cfg.polling.timeout_ms = 30000;
        cfg.polling.timeout_duration_ms = 60000;

        cfg.wled.controllers[0].interval_ms = Some(1500);
        cfg.wled.controllers[0].timeout_ms = Some(45000);

        let polling = cfg.polling_for_controller(&cfg.wled.controllers[0]);
        assert_eq!(polling.interval_ms, 1500);
        assert_eq!(polling.timeout_ms, 45000);
        assert_eq!(polling.timeout_duration_ms, 60000);
    }

    #[test]
    fn controller_http_timeout_overrides_global_value() {
        let mut cfg = valid_config();
        cfg.wled.http_timeout_ms = Some(3500);
        cfg.wled.controllers[0].http_timeout_ms = Some(5000);

        let timeout = cfg.http_timeout_ms_for_controller(&cfg.wled.controllers[0]);
        assert_eq!(timeout, Some(5000));

        let timeout = cfg.http_timeout_ms_for_controller(&cfg.wled.controllers[1]);
        assert_eq!(timeout, Some(3500));
    }

    #[test]
    fn validate_rejects_invalid_mqtt_protocol() {
        let mut cfg = valid_config();
        cfg.mqtt.protocol = "ws".to_string();
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("mqtt.protocol"));
    }

    #[test]
    fn validate_rejects_zero_http_timeout() {
        let mut cfg = valid_config();
        cfg.wled.http_timeout_ms = Some(0);
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("wled.http_timeout_ms"));
    }

    #[test]
    fn validate_rejects_reconnect_window_mismatch() {
        let mut cfg = valid_config();
        cfg.mqtt.reconnect_delay_secs = 20;
        cfg.mqtt.reconnect_max_delay_secs = 10;
        let err = cfg.validate().expect_err("expected validation error");
        assert!(err.to_string().contains("reconnect_max_delay_secs"));
    }
}
