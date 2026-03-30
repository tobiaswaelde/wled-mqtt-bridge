use std::{fs, path::Path, path::PathBuf};

use anyhow::{Context, Result};
use clap::Parser;
use tracing_subscriber::{fmt, EnvFilter};
use wled_mqtt_bridge::{bridge, config::AppConfig, metrics::BridgeMetrics};

const EXAMPLE_CONFIG: &str = include_str!("../config/config.example.yml");

#[derive(Debug, Parser)]
#[command(author, version, about = "WLED to MQTT bridge")]
struct Cli {
    #[arg(short, long, default_value = "config/config.yml")]
    config: PathBuf,

    #[arg(long)]
    healthcheck: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    if cli.healthcheck {
        return run_healthcheck(&cli.config).await;
    }

    ensure_config_exists(&cli.config)?;

    let config = AppConfig::load(&cli.config)?;
    config.validate()?;
    init_logging(&config)?;
    let metrics = std::sync::Arc::new(BridgeMetrics::default());
    metrics.set_active_controllers(config.wled.controllers.len() as u64);

    let _metrics_server_handle =
        wled_mqtt_bridge::metrics::spawn_metrics_server(&config.metrics, metrics.clone()).await?;

    bridge::run(config, metrics).await
}

fn ensure_config_exists(path: &Path) -> Result<()> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create config directory {}", parent.display()))?;
    }

    fs::write(path, EXAMPLE_CONFIG)
        .with_context(|| format!("failed to create config file {}", path.display()))?;

    eprintln!(
        "Created example config at {}. Update it with your values and restart.",
        path.display()
    );

    Ok(())
}

async fn run_healthcheck(path: &Path) -> Result<()> {
    let config = AppConfig::load(path)?;
    config.validate()?;

    let mut mqtt_options = rumqttc::MqttOptions::new(
        format!("wled-mqtt-bridge-healthcheck-{}", uuid::Uuid::new_v4()),
        config.mqtt.host,
        config.mqtt.port,
    );
    mqtt_options.set_keep_alive(std::time::Duration::from_secs(5));
    mqtt_options.set_clean_session(true);

    if config.mqtt.protocol.eq_ignore_ascii_case("mqtts") {
        mqtt_options.set_transport(rumqttc::Transport::tls_with_default_config());
    }

    if let Some(username) = &config.mqtt.username {
        mqtt_options.set_credentials(username, config.mqtt.password.clone().unwrap_or_default());
    }

    let (_client, mut eventloop) = rumqttc::AsyncClient::new(mqtt_options, 10);

    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            match eventloop.poll().await {
                Ok(rumqttc::Event::Incoming(rumqttc::Incoming::ConnAck(_))) => {
                    return Ok::<(), rumqttc::ConnectionError>(());
                }
                Ok(_) => continue,
                Err(_) => {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
            }
        }
    })
    .await
    .context("mqtt healthcheck timed out")?
    .context("mqtt healthcheck failed")?;

    Ok(())
}

fn init_logging(config: &AppConfig) -> Result<()> {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(config.logging.level.clone()))?;

    if config.logging.json {
        fmt().with_env_filter(filter).json().init();
    } else {
        fmt().with_env_filter(filter).init();
    }

    Ok(())
}
