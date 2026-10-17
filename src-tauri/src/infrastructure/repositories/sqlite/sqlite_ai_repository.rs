use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;
use uuid::{Uuid, fmt::Hyphenated};

use crate::{
    ai_integration::{
        entities::{
            chat::Chat,
            context_snippet::ContextSnippet,
            message::{Message, MessageContent},
        },
        repositories::ai_repository::AiRepository,
    },
    common::repository_error::RepositoryError,
    infrastructure::{
        repositories::sqlite::sqlite_rows::{
            chat_row::ChatRow,
            context_snippet_row::ContextSnippetRow,
            message_row::{
                ASSISTANT_CONTENT_TYPE, DOCUMENT_CONTENT_TYPE, HUMAN_CONTENT_TYPE, MessageRow,
                TOOL_CALL_CONTENT_TYPE, TOOL_RESULT_TYPE,
            },
        },
        value_objects::db_transaction::DbTransaction,
    },
};

#[derive(ScopeInjectable)]
pub struct SqliteAiRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl AiRepository for SqliteAiRepository {
    async fn get_all_chats_sorted_by_last_activity_desc(
        &self,
    ) -> Result<Vec<(Chat, DateTime<Utc>)>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT
                c.id as "id!: Hyphenated",
                c.created_date as "created_date!: DateTime<Utc>",
                c.title as "title!",
                COALESCE(MAX(m.created_date), c.created_date) as "last_activity_date!: DateTime<Utc>"
            FROM ai_chats c
            LEFT JOIN ai_messages m ON m.ai_chat_id = c.id
            GROUP BY c.id
            ORDER BY 4 DESC"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let chat = ChatRow {
                    id: row.id,
                    title: row.title,
                    created_date: row.created_date,
                };
                (chat.into(), row.last_activity_date)
            })
            .collect())
    }

    async fn upsert_chat(&self, chat: &Chat) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let id = chat.id();
        let created_date = chat.created_date();
        let title = chat.title();

        let result = sqlx::query!(
            r#"INSERT INTO ai_chats(
                id,
                created_date,
                title)
            VALUES ($1, datetime($2), $3)
            ON CONFLICT(id) DO UPDATE
            SET id = $1,
                created_date = datetime($2),
                title = $3
            "#,
            id.hyphenated(),
            created_date,
            title
        )
        .execute(&mut *tx)
        .await;

        result?;
        Ok(())
    }

    async fn get_chat_by_id(&self, id: Uuid) -> Result<Chat, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let chat_row = sqlx::query_as!(
            ChatRow,
            r#"SELECT
                id as "id: _",
                created_date as "created_date: _",
                title
            FROM ai_chats
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await;

        Ok(chat_row?.into())
    }

    async fn upsert_message(&self, message: &Message) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let id = message.id();
        let created_date = message.created_date();
        let chat_id = message.chat_id();

        let content_type;
        let content;

        match message.content() {
            MessageContent::Human(content_value) => {
                content_type = HUMAN_CONTENT_TYPE.to_string();
                content = content_value.clone();
            }
            MessageContent::Assistant(content_value) => {
                content_type = ASSISTANT_CONTENT_TYPE.to_string();
                content = content_value.clone();
            }
            MessageContent::ToolCall(tool_call) => {
                content_type = TOOL_CALL_CONTENT_TYPE.to_string();
                content = serde_json::to_string(tool_call).unwrap();
            }
            MessageContent::Document(document) => {
                content_type = DOCUMENT_CONTENT_TYPE.to_string();
                content = serde_json::to_string(document).unwrap();
            }
            MessageContent::ToolResult(tool_result) => {
                content_type = TOOL_RESULT_TYPE.to_string();
                content = serde_json::to_string(tool_result).unwrap();
            }
        };

        let result = sqlx::query!(
            r#"INSERT INTO ai_messages(
                id,
                created_date,
                ai_chat_id,
                content_type,
                content)
            VALUES ($1, datetime($2), $3, $4, $5)
            ON CONFLICT(id) DO UPDATE SET
                id = $1,
                created_date = datetime($2),
                ai_chat_id = $3,
                content_type = $4,
                content = $5
            "#,
            id.hyphenated(),
            created_date,
            chat_id.hyphenated(),
            content_type,
            content
        )
        .execute(&mut *tx)
        .await;

        result?;
        Ok(())
    }

    async fn get_message_by_id(&self, id: Uuid) -> Result<Message, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let message_row = sqlx::query_as!(
            MessageRow,
            r#"SELECT
                id as "id: _",
                created_date as "created_date: _",
                ai_chat_id as "chat_id: _",
                content_type,
                content
            FROM ai_messages
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await;

        Ok(message_row?.into())
    }

    async fn get_chat_messages_ordered(&self, id: Uuid) -> Result<Vec<Message>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let message_rows = sqlx::query_as!(
            MessageRow,
            r#"SELECT
                id as "id: _",
                created_date as "created_date: _",
                ai_chat_id as "chat_id: _",
                content_type,
                content
            FROM ai_messages
            WHERE ai_chat_id = $1
            ORDER BY created_date"#,
            id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await;

        Ok(message_rows?
            .into_iter()
            .map(|message| message.into())
            .collect())
    }

    async fn delete_chat(&self, id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let result = sqlx::query!("DELETE FROM ai_chats WHERE id = $1", id.hyphenated())
            .execute(&mut *tx)
            .await;

        result?;
        Ok(())
    }

    async fn upsert_context_snippet(
        &self,
        snippet: &ContextSnippet,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let id = snippet.id();
        let message_id = snippet.message_id();
        let text = snippet.snippet();
        let position = snippet.position();

        let result = sqlx::query!(
            r#"INSERT INTO ai_message_context_snippets(
                id,
                ai_message_id,
                snippet,
                position)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(id) DO UPDATE SET
                id = $1,
                ai_message_id = $2,
                snippet = $3,
                position = $4
            "#,
            id.hyphenated(),
            message_id.hyphenated(),
            text,
            position
        )
        .execute(&mut *tx)
        .await;

        result?;
        Ok(())
    }

    async fn get_context_snippets_for_chat(
        &self,
        chat_id: Uuid,
    ) -> Result<Vec<ContextSnippet>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let snippet_rows = sqlx::query_as!(
            ContextSnippetRow,
            r#"SELECT
                s.id as "id: _",
                s.ai_message_id as "ai_message_id: _",
                s.snippet,
                s.position
            FROM ai_message_context_snippets s
            JOIN ai_messages m ON m.id = s.ai_message_id
            WHERE m.ai_chat_id = $1
            ORDER BY s.ai_message_id, s.position"#,
            chat_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await;

        Ok(snippet_rows?
            .into_iter()
            .map(|snippet| snippet.into())
            .collect())
    }
}

#[cfg(test)]
pub mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::{
        infrastructure::extensions::unit_of_work::UnitOfWorkExt, test_utils::create_test_injector,
    };

    use chrono::TimeZone;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, SqliteAiRepository);
        injector
    }

    #[tokio::test]
    pub async fn get_all_chats_sorted_by_last_activity_desc_older_chat_with_newer_message_returned_first()
     {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<SqliteAiRepository>().await;

        let older_created = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
        let newer_created = Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap();
        let message_date = Utc.with_ymd_and_hms(2026, 1, 3, 0, 0, 0).unwrap();

        let older = Chat::new_unchecked(Uuid::new_v4(), older_created, "Older".to_string());
        repository.upsert_chat(&older).await.unwrap();
        let newer = Chat::new_unchecked(Uuid::new_v4(), newer_created, "Newer".to_string());
        repository.upsert_chat(&newer).await.unwrap();
        repository
            .upsert_message(&Message::new_unchecked(
                Uuid::new_v4(),
                message_date,
                older.id(),
                MessageContent::Human("Human".to_string()),
            ))
            .await
            .unwrap();

        scope.save_changes().await.unwrap();

        // Act

        let actual = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();

        // Assert

        assert_eq!(actual, vec![(older, message_date), (newer, newer_created)]);
    }

    #[tokio::test]
    pub async fn get_chat_messages_ordered_multiple_messages_returned_all() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<SqliteAiRepository>().await;

        let chat = Chat::new(None, "Chat".to_string());
        repository.upsert_chat(&chat).await.unwrap();

        repository
            .upsert_message(&Message::new(
                None,
                chat.id(),
                MessageContent::Human("Human".to_string()),
            ))
            .await
            .unwrap();
        repository
            .upsert_message(&Message::new(
                None,
                chat.id(),
                MessageContent::Assistant("Assistant".to_string()),
            ))
            .await
            .unwrap();

        scope.save_changes().await.unwrap();

        // Act

        let actual = repository
            .get_chat_messages_ordered(chat.id())
            .await
            .unwrap();

        // Assert

        assert_eq!(actual.len(), 2);
        assert_eq!(
            *actual[0].content(),
            MessageContent::Human("Human".to_string())
        );
        assert_eq!(
            *actual[1].content(),
            MessageContent::Assistant("Assistant".to_string())
        );
    }

    #[tokio::test]
    pub async fn upsert_context_snippet_multiple_snippets_persisted_and_returned_in_position_order()
    {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<SqliteAiRepository>().await;

        let chat = Chat::new(None, "Chat".to_string());
        repository.upsert_chat(&chat).await.unwrap();

        let message = Message::new(None, chat.id(), MessageContent::Human("Human".to_string()));
        repository.upsert_message(&message).await.unwrap();

        repository
            .upsert_context_snippet(&ContextSnippet::new(
                None,
                message.id(),
                "Snippet one".to_string(),
                0,
            ))
            .await
            .unwrap();
        repository
            .upsert_context_snippet(&ContextSnippet::new(
                None,
                message.id(),
                "Snippet two".to_string(),
                1,
            ))
            .await
            .unwrap();

        scope.save_changes().await.unwrap();

        // Act

        let actual = repository
            .get_context_snippets_for_chat(chat.id())
            .await
            .unwrap();

        // Assert

        assert_eq!(actual.len(), 2);
        assert_eq!(actual[0].snippet(), "Snippet one");
        assert_eq!(actual[1].snippet(), "Snippet two");
    }

    #[tokio::test]
    pub async fn get_context_snippets_for_chat_message_without_snippets_returned_empty() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<SqliteAiRepository>().await;

        let chat = Chat::new(None, "Chat".to_string());
        repository.upsert_chat(&chat).await.unwrap();
        repository
            .upsert_message(&Message::new(
                None,
                chat.id(),
                MessageContent::Human("Human".to_string()),
            ))
            .await
            .unwrap();

        scope.save_changes().await.unwrap();

        // Act

        let actual = repository
            .get_context_snippets_for_chat(chat.id())
            .await
            .unwrap();

        // Assert

        assert!(actual.is_empty());
    }

    #[tokio::test]
    pub async fn delete_chat_valid_input_deleted_chat() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<SqliteAiRepository>().await;

        let chat1 = Chat::new(None, "First".to_string());
        repository.upsert_chat(&chat1).await.unwrap();
        let chat2 = Chat::new(None, "Second".to_string());
        repository.upsert_chat(&chat2).await.unwrap();

        scope.save_changes().await.unwrap();

        // Act

        repository.delete_chat(chat1.id()).await.unwrap();

        // Assert

        let actual = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        assert_eq!(actual.len(), 1);
        assert_eq!(actual[0].0.title(), "Second");
    }
}
