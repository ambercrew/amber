use std::sync::Arc;

use async_trait::async_trait;
use rig::ErrorReport;
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    ai_integration::{
        dto::stream_ai_request_dto::StreamAiRequestDto,
        entities::chat::Chat,
        entities::message::{ToolCallContent, ToolResultContent},
        services::agent_provider::AgentProviderError,
        services::ai_client_provider::AiClientProviderError,
        services::chat_creator::ChatCreatorError,
        services::tool_approval_resolver::ToolApprovalResolverError,
    },
    common::repository_error::RepositoryError,
    database::transaction_manager::TransactionManagerError,
    elements::value_objects::element_id::ElementId,
};

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum StreamLlmResponseEvent {
    CreatedChat(Chat),
    InProgress {
        chat_id: Uuid,
        text: String,
    },
    ToolCall {
        chat_id: Uuid,
        tool_call: Box<ToolCallContent>,
        /// Already persisted, so a call awaiting approval can be resolved mid-stream.
        message_id: Uuid,
        /// Where the call's change lands; never stored.
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_location: Option<ElementId>,
        /// Written by the tool for a call awaiting approval; never stored.
        #[serde(skip_serializing_if = "Option::is_none")]
        approval_markdown: Option<String>,
    },
    ToolResult {
        chat_id: Uuid,
        tool_result: ToolResultContent,
    },
    Error(String),
}

#[derive(Error, Debug)]
pub enum OnEventCallbackError {
    #[error("An unknown error occurred: {0}")]
    Tauri(#[from] tauri::Error),
}

pub type OnEventCallback =
    Arc<dyn Send + Sync + Fn(StreamLlmResponseEvent) -> Result<(), OnEventCallbackError>>;

#[derive(Error, Debug)]
pub enum AiStreamerError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("HTTP {status}: {message}")]
    ProviderHttpError { status: u16, message: String },
    #[error("{0}")]
    ProviderError(String),
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
    #[error(transparent)]
    OnEventCallback(#[from] OnEventCallbackError),
    #[error(transparent)]
    ChatCreator(#[from] ChatCreatorError),
    #[error(transparent)]
    AgentProvider(#[from] AgentProviderError),
    #[error(transparent)]
    TransactionManager(#[from] TransactionManagerError),
    #[error(transparent)]
    ToolApprovalResolver(#[from] ToolApprovalResolverError),
}

impl From<ErrorReport> for AiStreamerError {
    fn from(report: ErrorReport) -> Self {
        match provider_failure(&report) {
            (Some(status), message) => AiStreamerError::ProviderHttpError { status, message },
            (None, message) => AiStreamerError::ProviderError(message),
        }
    }
}

/// A failed provider call's HTTP status and the provider's own message, e.g. OpenAI's `error.message`.
pub fn provider_failure(report: &ErrorReport) -> (Option<u16>, String) {
    let body = report
        .provider_response
        .as_ref()
        .map(|response| &response.body);
    let message = body
        .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
        .and_then(|value| value["error"]["message"].as_str().map(String::from))
        .or_else(|| body.filter(|body| !body.is_empty()).cloned())
        .unwrap_or_else(|| report.message.clone());
    (report.http_status, message)
}

#[async_trait]
pub trait AiStreamer: Send + Sync {
    async fn stream(
        &self,
        request: StreamAiRequestDto,
        on_event: OnEventCallback,
    ) -> Result<(), AiStreamerError>;
}
