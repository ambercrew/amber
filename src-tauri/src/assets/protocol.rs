use std::sync::{Arc, LazyLock};

use injector::injector::Injector;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};
use tokio::sync::Semaphore;

use crate::assets::repositories::asset_repository::AssetRepository;
use crate::assets::value_objects::asset_id::AssetId;

/// Custom URI scheme serving stored assets to the webview, addressed by asset id.
pub const ASSET_PROTOCOL: &str = "amber-asset";

// Each read holds a pooled transaction, so an image-heavy page must not starve other commands of connections.
static ASSET_READ_PERMITS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(2));

/// Serves `amber-asset://localhost/<id>` (or the runtime's `http://amber-asset.localhost/<id>`).
pub fn handle_asset_request<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let injector = ctx.app_handle().state::<Arc<Injector>>().inner().clone();
    let id = request.uri().path().trim_start_matches('/').to_string();

    tauri::async_runtime::spawn(async move {
        responder.respond(build_response(&injector, &id).await);
    });
}

async fn build_response(injector: &Injector, id: &str) -> Response<Vec<u8>> {
    let Ok(asset_id) = AssetId::try_from(id.to_string()) else {
        return status_response(StatusCode::BAD_REQUEST);
    };

    let _permit = ASSET_READ_PERMITS
        .acquire()
        .await
        .expect("Asset read semaphore is never closed");
    let scope = injector.start_scope();
    match scope
        .resolve::<dyn AssetRepository>()
        .await
        .get(&asset_id)
        .await
    {
        // Content-addressed, so a found asset can never change.
        Ok(Some(asset)) => Response::builder()
            .header(header::CONTENT_TYPE, asset.mime_type)
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(asset.data)
            .expect("Asset response is always valid"),
        // Not cached: the asset may still arrive through sync.
        Ok(None) => status_response(StatusCode::NOT_FOUND),
        Err(err) => {
            log::error!("Failed to read asset {id}: {err:?}");
            status_response(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

fn status_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .expect("Status response is always valid")
}
