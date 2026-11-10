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
}

#[derive(Serialize, Clone)]
struct RequestEnvelope<T: Serialize> {
    #[serde(rename = "requestId")]
    request_id: Uuid,
    #[serde(flatten)]
    payload: T,
}

/// A reusable backend-to-frontend request/response channel over Tauri
/// events, for cases where an answer can only be produced on the frontend
/// (e.g. running the Lexical editor headlessly). One call to `request`
/// emits an event carrying a request id and payload, then awaits the
/// frontend's answer, which it delivers by calling the
/// `resolve_frontend_request` command with the same request id.
pub struct RequestBridge<R: tauri::Runtime> {
    app_handle: Arc<tauri::AppHandle<R>>,
    pending: Mutex<HashMap<Uuid, oneshot::Sender<String>>>,
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

    /// Emits `event` with `payload` (plus a generated request id) and
    /// awaits the frontend's response to that request id, failing after
    /// `DEFAULT_TIMEOUT` if the frontend never resolves it.
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
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err(RequestBridgeError::Emit),
            Err(_) => {
                self.cancel(request_id);
                Err(RequestBridgeError::Timeout)
            }
        }
    }

    fn register(&self, request_id: Uuid) -> oneshot::Receiver<String> {
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(request_id, sender);
        receiver
    }

    pub fn resolve(&self, request_id: Uuid, response: String) {
        if let Some(sender) = self.pending.lock().unwrap().remove(&request_id) {
            let _ = sender.send(response);
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
