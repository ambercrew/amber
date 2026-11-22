use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};
use serde::Serialize;
use tauri::Emitter;
use thiserror::Error;
use tokio::sync::oneshot;
use uuid::Uuid;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Error, Debug)]
pub enum RequestBridgeError {
    #[error("Failed to notify the frontend of the pending request")]
    Emit,
    #[error("The frontend did not respond to the request in time")]
    Timeout,
    #[error("{0}")]
    Failed(String),
}

#[derive(Serialize, Clone)]
struct RequestEnvelope<T: Serialize> {
    #[serde(rename = "requestId")]
    request_id: Uuid,
    #[serde(flatten)]
    payload: T,
}

/// A backend-to-frontend request over Tauri events, for answers only the frontend can give (e.g. headless
/// Lexical): `request` emits an id and payload, the frontend answers via `resolve_frontend_request`.
pub struct RequestBridge<R: tauri::Runtime> {
    app_handle: Arc<tauri::AppHandle<R>>,
    pending: Mutex<HashMap<Uuid, oneshot::Sender<Result<String, String>>>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for RequestBridge<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let app_handle = scope.resolve::<tauri::AppHandle<R>>().await;
        Self::new(app_handle)
    }
}

impl<R: tauri::Runtime> RequestBridge<R> {
    pub fn new(app_handle: Arc<tauri::AppHandle<R>>) -> Self {
        Self {
            app_handle,
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Emits `event` with `payload` and a new request id, and awaits the frontend's answer,
    /// failing after `DEFAULT_TIMEOUT`.
    pub async fn request<T: Serialize + Send + Clone>(
        &self,
        event: &str,
        payload: T,
    ) -> Result<String, RequestBridgeError> {
        self.request_with_timeout(event, payload, DEFAULT_TIMEOUT)
            .await
    }

    /// `request` for work that can outlast `DEFAULT_TIMEOUT`, e.g. fetching images.
    pub async fn request_with_timeout<T: Serialize + Send + Clone>(
        &self,
        event: &str,
        payload: T,
        timeout: Duration,
    ) -> Result<String, RequestBridgeError> {
        let request_id = Uuid::new_v4();
        let receiver = self.register(request_id);

        self.app_handle
            .emit(
                event,
                RequestEnvelope {
                    request_id,
                    payload,
                },
            )
            .map_err(|_| RequestBridgeError::Emit)?;

        match tokio::time::timeout(timeout, receiver).await {
            Ok(Ok(Ok(response))) => Ok(response),
            Ok(Ok(Err(message))) => Err(RequestBridgeError::Failed(message)),
            Ok(Err(_)) => Err(RequestBridgeError::Emit),
            Err(_) => {
                self.cancel(request_id);
                Err(RequestBridgeError::Timeout)
            }
        }
    }

    fn register(&self, request_id: Uuid) -> oneshot::Receiver<Result<String, String>> {
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(request_id, sender);
        receiver
    }

    pub fn resolve(&self, request_id: Uuid, response: String) {
        self.settle(request_id, Ok(response));
    }

    /// Fails a pending request with the frontend's error instead of waiting out its timeout.
    pub fn reject(&self, request_id: Uuid, message: String) {
        self.settle(request_id, Err(message));
    }

    fn settle(&self, request_id: Uuid, result: Result<String, String>) {
        if let Some(sender) = self.pending.lock().unwrap().remove(&request_id) {
            let _ = sender.send(result);
        }
    }

    fn cancel(&self, request_id: Uuid) {
        self.pending.lock().unwrap().remove(&request_id);
    }
}

#[cfg(test)]
mod tests {
    use serde::Serialize;
    use tauri::Listener;

    use super::*;

    #[derive(Serialize, Clone)]
    struct PingPayload {
        message: String,
    }

    #[tokio::test]
    async fn request_resolved_before_timeout_returns_response() {
        // Arrange

        let app = tauri::test::mock_app();
        let app_handle = Arc::new(app.handle().clone());
        let bridge = Arc::new(RequestBridge::new(app_handle));

        let resolving_bridge = bridge.clone();
        app.listen("ping", move |event| {
            let envelope: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
            let request_id: Uuid = serde_json::from_value(envelope["requestId"].clone()).unwrap();
            resolving_bridge.resolve(request_id, "pong".to_string());
        });

        // Act

        let actual = bridge
            .request(
                "ping",
                PingPayload {
                    message: "hello".to_string(),
                },
            )
            .await
            .unwrap();

        // Assert

        assert_eq!("pong", actual);
    }

    #[tokio::test]
    async fn request_rejected_by_frontend_returns_failed_error() {
        // Arrange

        let app = tauri::test::mock_app();
        let app_handle = Arc::new(app.handle().clone());
        let bridge = Arc::new(RequestBridge::new(app_handle));

        let rejecting_bridge = bridge.clone();
        app.listen("ping", move |event| {
            let envelope: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
            let request_id: Uuid = serde_json::from_value(envelope["requestId"].clone()).unwrap();
            rejecting_bridge.reject(request_id, "chunk failed to load".to_string());
        });

        // Act

        let actual = bridge
            .request(
                "ping",
                PingPayload {
                    message: "hello".to_string(),
                },
            )
            .await;

        // Assert

        assert!(
            matches!(actual, Err(RequestBridgeError::Failed(message)) if message == "chunk failed to load")
        );
    }

    #[tokio::test]
    async fn resolve_unknown_request_id_does_not_panic() {
        // Arrange

        let app_handle = Arc::new(tauri::test::mock_app().handle().clone());
        let bridge = RequestBridge::new(app_handle);

        // Act

        bridge.resolve(Uuid::new_v4(), "ignored".to_string());

        // Assert

        // No pending receiver existed; resolving is a silent no-op.
    }

    #[tokio::test]
    async fn cancel_pending_request_drops_sender_and_receiver_errors() {
        // Arrange

        let app_handle = Arc::new(tauri::test::mock_app().handle().clone());
        let bridge = RequestBridge::new(app_handle);
        let request_id = Uuid::new_v4();
        let receiver = bridge.register(request_id);

        // Act

        bridge.cancel(request_id);

        // Assert

        assert!(receiver.await.is_err());
    }
}
