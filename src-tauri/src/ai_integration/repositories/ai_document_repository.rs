use async_trait::async_trait;
use uuid::Uuid;

use crate::ai_integration::entities::document::Document;
use crate::common::repository_error::RepositoryError;

#[async_trait]
pub trait AiDocumentRepository: Send + Sync {
    async fn insert(&self, documents: &[Document]) -> Result<(), RepositoryError>;

    /// The position the chat's next document takes, after every one it has.
    async fn next_position(&self, chat_id: Uuid) -> Result<u32, RepositoryError>;

    /// The chat's documents that may contain `query`, in position order.
    /// May include ones that don't (callers match exactly), never leaves one out.
    async fn find_candidates(
        &self,
        chat_id: Uuid,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<Document>, RepositoryError>;

    /// Copies one chat's documents of the named files into another, e.g. a branch of it.
    async fn copy_to_chat(
        &self,
        from_chat_id: Uuid,
        to_chat_id: Uuid,
        file_names: &[String],
    ) -> Result<(), RepositoryError>;
}
