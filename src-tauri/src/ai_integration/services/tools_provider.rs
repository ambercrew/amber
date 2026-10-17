use async_trait::async_trait;
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::tools::app_tools::AppTools;
use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;

#[derive(Error, Debug)]
pub enum ToolsProviderError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("The tool call's saved context is invalid")]
    InvalidContext(#[from] serde_json::Error),
}

#[async_trait]
pub trait ToolsProvider: Send + Sync {
    /// Captures what the tools need from the conversation, so they can be built again later.
    fn capture_context(&self, chat_id: Uuid, element_id: Option<ElementId>) -> Value;

    /// Builds every tool from a captured context; the agent keeps those applicable to its chat.
    async fn get_tools(&self, context: &Value) -> Result<AppTools, ToolsProviderError>;
}
