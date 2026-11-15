use async_trait::async_trait;
use rig::ErrorReport;
use thiserror::Error;

use crate::SourceError;
use crate::ai_integration::entities::chat::Chat;
use crate::ai_integration::services::ai_client_provider::AiClientProviderError;
use crate::ai_integration::services::ai_streamer::provider_failure;

#[derive(Error, Debug)]
pub enum ChatCreatorError {
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
    #[error("HTTP {status}: {message}")]
    ProviderHttpError { status: u16, message: String },
    #[error("{0}")]
    ProviderError(String),
    #[error("Failed to create the chat: {0}")]
    CreateChat(#[source] SourceError),
    #[error("Chat creation was cancelled")]
    Cancelled,
}

impl From<ErrorReport> for ChatCreatorError {
    fn from(report: ErrorReport) -> Self {
        match provider_failure(&report) {
            (Some(status), message) => ChatCreatorError::ProviderHttpError { status, message },
            (None, message) => ChatCreatorError::ProviderError(message),
        }
    }
}

#[async_trait]
pub trait ChatCreator: Send + Sync {
    async fn create_chat(&self, prompt: &str) -> Result<Chat, ChatCreatorError>;
}
