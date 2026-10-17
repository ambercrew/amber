use std::sync::Arc;

use async_trait::async_trait;
use rig::{completion::CompletionError, http_client::Error as HttpClientError};
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
        tool_call: ToolCallContent,
        /// Already persisted, so a call awaiting approval can be resolved mid-stream.
        message_id: Uuid,
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

impl TryFrom<CompletionError> for AiStreamerError {
    type Error = CompletionError;

    fn try_from(err: CompletionError) -> Result<Self, Self::Error> {
        match err {
            CompletionError::HttpError(HttpClientError::InvalidStatusCodeWithMessage(
                status,
                body,
            )) => {
                let message = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v["error"]["message"].as_str().map(String::from))
                    .unwrap_or(body);
                Ok(AiStreamerError::ProviderHttpError {
                    status: status.as_u16(),
                    message,
                })
            }
            CompletionError::ProviderError(message) => Ok(AiStreamerError::ProviderError(message)),
            other => Err(other),
        }
    }
}

#[async_trait]
pub trait AiStreamer: Send + Sync {
    async fn stream(
        &self,
        request: StreamAiRequestDto,
        on_event: OnEventCallback,
    ) -> Result<(), AiStreamerError>;
}
