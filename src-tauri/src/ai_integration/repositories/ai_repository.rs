use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{
    ai_integration::entities::{chat::Chat, context_snippet::ContextSnippet, message::Message},
    common::repository_error::RepositoryError,
};

#[async_trait]
pub trait AiRepository: Send + Sync {
    async fn get_all_chats_sorted_by_last_activity_desc(
        &self,
    ) -> Result<Vec<(Chat, DateTime<Utc>)>, RepositoryError>;
    async fn upsert_chat(&self, chat: &Chat) -> Result<(), RepositoryError>;
    async fn get_chat_by_id(&self, id: Uuid) -> Result<Chat, RepositoryError>;
    async fn upsert_message(&self, message: &Message) -> Result<(), RepositoryError>;
    async fn get_chat_messages_ordered(&self, id: Uuid) -> Result<Vec<Message>, RepositoryError>;
    async fn delete_chat(&self, id: Uuid) -> Result<(), RepositoryError>;
    async fn upsert_context_snippet(&self, snippet: &ContextSnippet)
    -> Result<(), RepositoryError>;
    /// Fetches every context snippet for every message in a chat, ordered by
    /// position within its message.
    async fn get_context_snippets_for_chat(
        &self,
        chat_id: Uuid,
    ) -> Result<Vec<ContextSnippet>, RepositoryError>;
}
