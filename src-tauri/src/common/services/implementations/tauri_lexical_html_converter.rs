use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};

use crate::common::events::convert_lexical_to_html_event::{
    CONVERT_LEXICAL_TO_HTML_EVENT, ConvertLexicalToHtmlEventDto, ConvertLexicalToHtmlResponseDto,
};
use crate::common::request_bridge::{RequestBridge, RequestBridgeError};
use crate::common::services::lexical_html_converter::{
    LexicalHtmlConverter, LexicalHtmlConverterError,
};

const BATCH_SIZE: usize = 100;
const BATCH_TIMEOUT: Duration = Duration::from_secs(60);

pub struct TauriLexicalHtmlConverter<R: tauri::Runtime> {
    bridge: Arc<RequestBridge<R>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriLexicalHtmlConverter<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let bridge = scope.resolve::<RequestBridge<R>>().await;
        Self { bridge }
    }
}

#[async_trait]
impl<R: tauri::Runtime> LexicalHtmlConverter for TauriLexicalHtmlConverter<R> {
    async fn convert_to_html(
        &self,
        contents: Vec<String>,
    ) -> Result<Vec<String>, LexicalHtmlConverterError> {
        let mut htmls = Vec::with_capacity(contents.len());
        for batch in contents.chunks(BATCH_SIZE) {
            let payload = ConvertLexicalToHtmlEventDto {
                contents: batch.to_vec(),
            };
            let response = self
                .bridge
                .request_with_timeout(CONVERT_LEXICAL_TO_HTML_EVENT, payload, BATCH_TIMEOUT)
                .await
                .map_err(|err| match err {
                    RequestBridgeError::Emit => LexicalHtmlConverterError::Emit,
                    RequestBridgeError::Timeout => LexicalHtmlConverterError::Timeout,
                })?;
            match serde_json::from_str(&response) {
                Ok(ConvertLexicalToHtmlResponseDto::Htmls(converted))
                    if converted.len() == batch.len() =>
                {
                    htmls.extend(converted)
                }
                Ok(ConvertLexicalToHtmlResponseDto::Error(message)) => {
                    return Err(LexicalHtmlConverterError::Failed(message));
                }
                _ => return Err(LexicalHtmlConverterError::InvalidResponse),
            }
        }
        Ok(htmls)
    }
}
