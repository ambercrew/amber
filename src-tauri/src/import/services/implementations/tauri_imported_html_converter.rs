use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};

use crate::common::request_bridge::{RequestBridge, RequestBridgeError};
use crate::import::events::convert_imported_html_event::{
    CONVERT_IMPORTED_HTML_EVENT, ConvertImportedHtmlEventDto, ConvertImportedHtmlResponseDto,
};
use crate::import::services::imported_html_converter::{
    ImportedHtmlConverter, ImportedHtmlConverterError,
};

/// Small enough that a batch fetching remote images still answers within the timeout.
const BATCH_SIZE: usize = 25;
const BATCH_TIMEOUT: Duration = Duration::from_secs(120);

pub struct TauriImportedHtmlConverter<R: tauri::Runtime> {
    bridge: Arc<RequestBridge<R>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriImportedHtmlConverter<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let bridge = scope.resolve::<RequestBridge<R>>().await;
        Self { bridge }
    }
}

#[async_trait]
impl<R: tauri::Runtime> ImportedHtmlConverter for TauriImportedHtmlConverter<R> {
    async fn convert(&self, htmls: Vec<String>) -> Result<Vec<String>, ImportedHtmlConverterError> {
        let mut converted = Vec::with_capacity(htmls.len());
        for batch in htmls.chunks(BATCH_SIZE) {
            let response = self
                .bridge
                .request_with_timeout(
                    CONVERT_IMPORTED_HTML_EVENT,
                    ConvertImportedHtmlEventDto {
                        htmls: batch.to_vec(),
                    },
                    BATCH_TIMEOUT,
                )
                .await
                .map_err(|err| match err {
                    RequestBridgeError::Emit => ImportedHtmlConverterError::Emit,
                    RequestBridgeError::Timeout => ImportedHtmlConverterError::Timeout,
                })?;
            match serde_json::from_str(&response) {
                Ok(ConvertImportedHtmlResponseDto::Contents(contents))
                    if contents.len() == batch.len() =>
                {
                    converted.extend(contents)
                }
                Ok(ConvertImportedHtmlResponseDto::Error(message)) => {
                    return Err(ImportedHtmlConverterError::Failed(message));
                }
                _ => return Err(ImportedHtmlConverterError::InvalidResponse),
            }
        }
        Ok(converted)
    }
}
