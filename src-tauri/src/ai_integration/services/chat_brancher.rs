use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::chat::Chat;
use crate::common::repository_error::RepositoryError;

#[derive(Error, Debug)]
pub enum ChatBrancherError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("This message isn't part of the chat")]
    MessageNotInChat,
}

#[async_trait]
pub trait ChatBrancher: Send + Sync {
    /// Copies the chat up to and including `message_id` into a new chat.
    async fn branch_chat(&self, chat_id: Uuid, message_id: Uuid)
    -> Result<Chat, ChatBrancherError>;
}
