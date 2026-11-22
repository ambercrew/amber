use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;
use uuid::Uuid;

use crate::common::api_error::ApiError;
use crate::common::request_bridge::RequestBridge;

/// Delivers the frontend's answer to a pending `RequestBridge::request` (e.g. a Lexical conversion),
/// by the request id the backend emitted.
#[tauri::command]
pub async fn resolve_frontend_request(
    injector: State<'_, Arc<Injector>>,
    request_id: Uuid,
    response: String,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let bridge = scope.resolve::<RequestBridge<crate::AppRuntime>>().await;
    bridge.resolve(request_id, response);
    Ok(())
}

/// Fails a pending `RequestBridge::request` call with the frontend's error message.
#[tauri::command]
pub async fn reject_frontend_request(
    injector: State<'_, Arc<Injector>>,
    request_id: Uuid,
    message: String,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let bridge = scope.resolve::<RequestBridge<crate::AppRuntime>>().await;
    bridge.reject(request_id, message);
    Ok(())
}
