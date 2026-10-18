use async_trait::async_trait;
use uuid::Uuid;

use crate::ai_integration::entities::ai_prompt::AiPrompt;
use crate::common::repository_error::RepositoryError;

#[async_trait]
pub trait AiPromptRepository: Send + Sync {
    async fn create(&self, prompt: &AiPrompt) -> Result<(), RepositoryError>;
    async fn update(&self, prompt: &AiPrompt) -> Result<(), RepositoryError>;
    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<AiPrompt, RepositoryError>;
    /// Ordered by name, ignoring case.
    async fn get_all(&self) -> Result<Vec<AiPrompt>, RepositoryError>;
}
