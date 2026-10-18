use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::ai_prompt::AiPrompt;
use crate::common::repository_error::RepositoryError;

#[derive(Error, Debug)]
pub enum AiPromptError {
    #[error("A prompt needs a name and text")]
    Empty,
    #[error(transparent)]
    Repository(#[from] RepositoryError),
}

/// Manages the user's prompt library.
#[async_trait]
pub trait AiPromptService: Send + Sync {
    async fn list_prompts(&self) -> Result<Vec<AiPrompt>, AiPromptError>;

    /// Trims the name and content, refusing either being blank.
    async fn create_prompt(&self, name: String, content: String)
    -> Result<AiPrompt, AiPromptError>;

    /// Trims the name and content, refusing either being blank.
    async fn update_prompt(
        &self,
        id: Uuid,
        name: String,
        content: String,
    ) -> Result<AiPrompt, AiPromptError>;

    async fn delete_prompt(&self, id: Uuid) -> Result<(), AiPromptError>;
}
