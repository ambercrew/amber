use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::message::{Message, ToolCallContent};
use crate::ai_integration::services::tools_provider::ToolsProviderError;
use crate::ai_integration::tools::app_tools::ToolCallDescription;
use crate::common::repository_error::RepositoryError;

#[derive(Error, Debug)]
pub enum ToolApprovalResolverError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("This message isn't awaiting approval")]
    NotAwaitingApproval,
    #[error("This was already approved or rejected")]
    AlreadyResolved,
    #[error(transparent)]
    Tools(#[from] ToolsProviderError),
    #[error("{0}")]
    ToolFailed(String),
}

#[async_trait]
pub trait ToolApprovalResolver: Send + Sync {
    /// Records the user's decision on a tool call awaiting approval, running the tool if approved.
    async fn resolve(
        &self,
        message_id: Uuid,
        approved: bool,
    ) -> Result<Message, ToolApprovalResolverError>;

    /// How a call is shown, written by its tool each time; only calls with a saved context have one.
    async fn describe(
        &self,
        tool_call: &ToolCallContent,
    ) -> Result<ToolCallDescription, ToolApprovalResolverError>;
}
