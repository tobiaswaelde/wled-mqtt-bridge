use std::{net::SocketAddr, sync::Arc};

use anyhow::{Context, Result};
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use tokio::sync::RwLock;

use crate::config::MetricsConfig;

#[derive(Debug, Default)]
pub struct BridgeMetrics {
    mqtt_connack_total: std::sync::atomic::AtomicU64,
    mqtt_publish_error_total: std::sync::atomic::AtomicU64,
    mqtt_eventloop_error_total: std::sync::atomic::AtomicU64,
    wled_poll_error_total: std::sync::atomic::AtomicU64,
    command_error_total: std::sync::atomic::AtomicU64,
    dead_letter_total: std::sync::atomic::AtomicU64,
    active_controllers: std::sync::atomic::AtomicU64,
}

impl BridgeMetrics {
    pub fn inc_mqtt_connack(&self) {
        self.mqtt_connack_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn inc_mqtt_publish_error(&self) {
        self.mqtt_publish_error_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn inc_mqtt_eventloop_error(&self) {
        self.mqtt_eventloop_error_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn inc_wled_poll_error(&self) {
        self.wled_poll_error_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn inc_command_error(&self) {
        self.command_error_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn inc_dead_letter(&self) {
        self.dead_letter_total
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn set_active_controllers(&self, value: u64) {
        self.active_controllers
            .store(value, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn render_prometheus(&self) -> String {
        format!(
            "# TYPE wled_mqtt_bridge_mqtt_connack_total counter\n\
             wled_mqtt_bridge_mqtt_connack_total {}\n\
             # TYPE wled_mqtt_bridge_mqtt_publish_error_total counter\n\
             wled_mqtt_bridge_mqtt_publish_error_total {}\n\
             # TYPE wled_mqtt_bridge_mqtt_eventloop_error_total counter\n\
             wled_mqtt_bridge_mqtt_eventloop_error_total {}\n\
             # TYPE wled_mqtt_bridge_wled_poll_error_total counter\n\
             wled_mqtt_bridge_wled_poll_error_total {}\n\
             # TYPE wled_mqtt_bridge_command_error_total counter\n\
             wled_mqtt_bridge_command_error_total {}\n\
             # TYPE wled_mqtt_bridge_dead_letter_total counter\n\
             wled_mqtt_bridge_dead_letter_total {}\n\
             # TYPE wled_mqtt_bridge_active_controllers gauge\n\
             wled_mqtt_bridge_active_controllers {}\n",
            self.mqtt_connack_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.mqtt_publish_error_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.mqtt_eventloop_error_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.wled_poll_error_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.command_error_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.dead_letter_total
                .load(std::sync::atomic::Ordering::Relaxed),
            self.active_controllers
                .load(std::sync::atomic::Ordering::Relaxed),
        )
    }
}

#[derive(Clone)]
struct MetricsState {
    metrics: Arc<BridgeMetrics>,
    path: Arc<RwLock<String>>,
}

pub async fn spawn_metrics_server(
    config: &MetricsConfig,
    metrics: Arc<BridgeMetrics>,
) -> Result<Option<tokio::task::JoinHandle<()>>> {
    if !config.enabled {
        return Ok(None);
    }

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .with_context(|| "invalid metrics host/port")?;

    let state = MetricsState {
        metrics,
        path: Arc::new(RwLock::new(config.path.clone())),
    };

    let app = Router::new()
        .route("/metrics", get(metrics_handler))
        .route("/*rest", get(dynamic_metrics_path_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind metrics endpoint on {addr}"))?;

    let handle = tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            tracing::error!(?err, "metrics server terminated");
        }
    });

    Ok(Some(handle))
}

async fn metrics_handler(State(state): State<MetricsState>) -> impl IntoResponse {
    let body = state.metrics.render_prometheus();
    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4")],
        body,
    )
}

async fn dynamic_metrics_path_handler(
    State(state): State<MetricsState>,
    request: axum::http::Request<axum::body::Body>,
) -> Response {
    let configured = state.path.read().await;
    if request.uri().path() == configured.as_str() {
        let body = state.metrics.render_prometheus();
        (
            StatusCode::OK,
            [("content-type", "text/plain; version=0.0.4")],
            body,
        )
            .into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_prometheus_contains_metric_lines() {
        let metrics = BridgeMetrics::default();
        metrics.inc_dead_letter();
        let body = metrics.render_prometheus();
        assert!(body.contains("wled_mqtt_bridge_dead_letter_total 1"));
        assert!(body.contains("wled_mqtt_bridge_active_controllers"));
    }
}
