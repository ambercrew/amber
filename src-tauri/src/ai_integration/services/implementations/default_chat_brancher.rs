use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::ai_integration::entities::chat::Chat;
use crate::ai_integration::entities::context_snippet::ContextSnippet;
use crate::ai_integration::entities::message::Message;
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::chat_brancher::{ChatBrancher, ChatBrancherError};

#[derive(ScopeInjectable)]
pub struct DefaultChatBrancher {
    ai_repository: Arc<dyn AiRepository>,
}

#[async_trait]
impl ChatBrancher for DefaultChatBrancher {
    async fn branch_chat(
        &self,
        chat_id: Uuid,
        message_id: Uuid,
    ) -> Result<Chat, ChatBrancherError> {
        let chat = self.ai_repository.get_chat_by_id(chat_id).await?;
        let messages = self
            .ai_repository
            .get_chat_messages_ordered(chat_id)
            .await?;
        let end = messages
            .iter()
            .position(|message| message.id() == message_id)
            .ok_or(ChatBrancherError::MessageNotInChat)?;
        let copied = &messages[..=end];

        let branch = Chat::new(None, format!("{} (branch)", chat.title()));
        self.ai_repository.upsert_chat(&branch).await?;

        // Shifted so the last copied message is dated now, keeping their order and the branch atop the chat list.
        let shift = Utc::now() - copied[end].created_date();
        let mut new_ids = HashMap::with_capacity(copied.len());
        for message in copied {
            let copy = Message::new_unchecked(
                Uuid::new_v4(),
                message.created_date() + shift,
                branch.id(),
                message.content().clone(),
            );
            self.ai_repository.upsert_message(&copy).await?;
            new_ids.insert(message.id(), copy.id());
        }

        for snippet in self
            .ai_repository
            .get_context_snippets_for_chat(chat_id)
            .await?
        {
            let Some(&new_message_id) = new_ids.get(&snippet.message_id()) else {
                continue;
            };
            let copy = ContextSnippet::new(
                None,
                new_message_id,
                snippet.snippet().to_string(),
                snippet.position(),
            );
            self.ai_repository.upsert_context_snippet(&copy).await?;
        }

        Ok(branch)
    }
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::{
        ai_integration::entities::{
            context_snippet::group_snippets_by_message, message::MessageContent,
        },
        infrastructure::repositories::sqlite::sqlite_ai_repository::SqliteAiRepository,
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(injector, dyn ChatBrancher, DefaultChatBrancher);
        injector
    }

    /// Inserts a chat with a question, its answer and a follow-up, a second apart.
    async fn insert_chat(ai_repository: &Arc<dyn AiRepository>) -> (Chat, Vec<Message>) {
        let chat = Chat::new(None, "Photosynthesis".to_string());
        ai_repository.upsert_chat(&chat).await.unwrap();

        let start = Utc::now() - chrono::Duration::hours(1);
        let contents = [
            MessageContent::Human("What is it?".to_string()),
            MessageContent::Assistant("Plants making sugar.".to_string()),
            MessageContent::Human("Why?".to_string()),
        ];
        let mut messages = Vec::new();
        for (index, content) in contents.into_iter().enumerate() {
            let message = Message::new_unchecked(
                Uuid::new_v4(),
                start + chrono::Duration::seconds(index as i64),
                chat.id(),
                content,
            );
            ai_repository.upsert_message(&message).await.unwrap();
            messages.push(message);
        }
        ai_repository
            .upsert_context_snippet(&ContextSnippet::new(
                None,
                messages[0].id(),
                "Selected passage".to_string(),
                0,
            ))
            .await
            .unwrap();
        (chat, messages)
    }

    #[tokio::test]
    async fn branch_chat_middle_message_copied_messages_up_to_it_with_their_snippets() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let brancher = scope.resolve::<dyn ChatBrancher>().await;
        let (chat, messages) = insert_chat(&ai_repository).await;

        // Act

        let branch = brancher
            .branch_chat(chat.id(), messages[1].id())
            .await
            .unwrap();

        // Assert

        assert_eq!("Photosynthesis (branch)", branch.title());
        let copied = ai_repository
            .get_chat_messages_ordered(branch.id())
            .await
            .unwrap();
        let contents: Vec<_> = copied.iter().map(|m| m.content().clone()).collect();
        assert_eq!(
            vec![messages[0].content().clone(), messages[1].content().clone()],
            contents
        );
        let snippets = group_snippets_by_message(
            ai_repository
                .get_context_snippets_for_chat(branch.id())
                .await
                .unwrap(),
        );
        assert_eq!(
            Some(&vec!["Selected passage".to_string()]),
            snippets.get(&copied[0].id())
        );
    }

    #[tokio::test]
    async fn branch_chat_any_message_left_original_chat_unchanged() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let brancher = scope.resolve::<dyn ChatBrancher>().await;
        let (chat, messages) = insert_chat(&ai_repository).await;

        // Act

        brancher
            .branch_chat(chat.id(), messages[0].id())
            .await
            .unwrap();

        // Assert

        let actual = ai_repository
            .get_chat_messages_ordered(chat.id())
            .await
            .unwrap();
        let summary = |messages: &[Message]| -> Vec<_> {
            messages
                .iter()
                .map(|m| (m.id(), m.content().clone()))
                .collect()
        };
        assert_eq!(summary(&messages), summary(&actual));
    }

    #[tokio::test]
    async fn branch_chat_any_message_listed_branch_as_most_recent_chat() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let brancher = scope.resolve::<dyn ChatBrancher>().await;
        let (chat, messages) = insert_chat(&ai_repository).await;

        // Act

        let branch = brancher
            .branch_chat(chat.id(), messages[0].id())
            .await
            .unwrap();

        // Assert

        let chats = ai_repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        assert_eq!(branch.id(), chats[0].0.id());
    }

    #[tokio::test]
    async fn branch_chat_message_from_another_chat_returned_message_not_in_chat() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let brancher = scope.resolve::<dyn ChatBrancher>().await;
        let (chat, _) = insert_chat(&ai_repository).await;

        // Act

        let actual = brancher.branch_chat(chat.id(), Uuid::new_v4()).await;

        // Assert

        assert!(matches!(actual, Err(ChatBrancherError::MessageNotInChat)));
    }
}
