use std::sync::Arc;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};

use crate::common::events::convert_markdown_to_lexical_event::{
    CONVERT_MARKDOWN_TO_LEXICAL_EVENT, ConvertMarkdownToLexicalPayload,
};
use crate::common::request_bridge::{RequestBridge, RequestBridgeError};
use crate::common::services::lexical_json_converter::{
    LexicalJsonConverter, LexicalJsonConverterError,
};

pub struct TauriLexicalJsonConverter<R: tauri::Runtime> {
    bridge: Arc<RequestBridge<R>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriLexicalJsonConverter<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let bridge = scope.resolve::<RequestBridge<R>>().await;
        Self { bridge }
    }
}

#[async_trait]
impl<R: tauri::Runtime> LexicalJsonConverter for TauriLexicalJsonConverter<R> {
    async fn convert_markdown(&self, markdown: &str) -> Result<String, LexicalJsonConverterError> {
        self.bridge
            .request(
                CONVERT_MARKDOWN_TO_LEXICAL_EVENT,
                ConvertMarkdownToLexicalPayload {
                    markdown: markdown.to_string(),
                },
            )
            .await
            .map_err(|err| match err {
                RequestBridgeError::Emit => LexicalJsonConverterError::Emit,
                RequestBridgeError::Timeout => LexicalJsonConverterError::Timeout,
                RequestBridgeError::Failed(message) => LexicalJsonConverterError::Failed(message),
            })
    }
}
