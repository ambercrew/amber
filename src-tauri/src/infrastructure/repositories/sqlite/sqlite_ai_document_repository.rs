use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use sqlx::{QueryBuilder, Sqlite};
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::ai_integration::entities::document::Document;
use crate::ai_integration::repositories::ai_document_repository::AiDocumentRepository;
use crate::common::repository_error::RepositoryError;
use crate::infrastructure::repositories::sqlite::text_prefilter::TextPrefilter;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

type DocumentRow = (Hyphenated, Hyphenated, String, i64, Option<i64>, String);

fn into_document((id, chat_id, file_name, position, page, content): DocumentRow) -> Document {
    Document {
        id: id.into_uuid(),
        chat_id: chat_id.into_uuid(),
        file_name,
        position: position as u32,
        page: page.map(|page| page as u32),
        content,
    }
}

#[derive(ScopeInjectable)]
pub struct SqliteAiDocumentRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl AiDocumentRepository for SqliteAiDocumentRepository {
    async fn insert(&self, documents: &[Document]) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        for document in documents {
            sqlx::query(
                "INSERT INTO ai_documents (id, ai_chat_id, file_name, position, page, content) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(document.id.hyphenated().to_string())
            .bind(document.chat_id.hyphenated().to_string())
            .bind(&document.file_name)
            .bind(document.position as i64)
            .bind(document.page.map(|page| page as i64))
            .bind(&document.content)
            .execute(tx.as_mut())
            .await?;
        }
        Ok(())
    }

    async fn next_position(&self, chat_id: Uuid) -> Result<u32, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let next: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM ai_documents WHERE ai_chat_id = $1",
        )
        .bind(chat_id.hyphenated().to_string())
        .fetch_one(tx.as_mut())
        .await?;
        Ok(next as u32)
    }

    async fn find_candidates(
        &self,
        chat_id: Uuid,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<Document>, RepositoryError> {
        let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            "SELECT id, ai_chat_id, file_name, position, page, content FROM ai_documents",
        );
        TextPrefilter::new(query, case_sensitive).push(&mut query_builder, "content");
        query_builder.push(" AND ai_chat_id = ");
        query_builder.push_bind(chat_id.hyphenated().to_string());
        query_builder.push(" ORDER BY position");

        let rows: Vec<DocumentRow> = {
            let mut tx = self.tx.lock().await;
            query_builder
                .build_query_as()
                .fetch_all(tx.as_mut())
                .await?
        };
        Ok(rows.into_iter().map(into_document).collect())
    }

    async fn copy_to_chat(
        &self,
        from_chat_id: Uuid,
        to_chat_id: Uuid,
        file_names: &[String],
    ) -> Result<(), RepositoryError> {
        let rows: Vec<DocumentRow> = {
            let mut tx = self.tx.lock().await;
            sqlx::query_as(
                "SELECT id, ai_chat_id, file_name, position, page, content FROM ai_documents \
                 WHERE ai_chat_id = $1 ORDER BY position",
            )
            .bind(from_chat_id.hyphenated().to_string())
            .fetch_all(tx.as_mut())
            .await?
        };
        let copies: Vec<Document> = rows
            .into_iter()
            .map(into_document)
            .filter(|document| file_names.contains(&document.file_name))
            .map(|document| Document {
                id: Uuid::new_v4(),
                chat_id: to_chat_id,
                ..document
            })
            .collect();
        self.insert(&copies).await
    }
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::ai_integration::entities::chat::Chat;
    use crate::ai_integration::repositories::ai_repository::AiRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_ai_repository::SqliteAiRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(
            injector,
            dyn AiDocumentRepository,
            SqliteAiDocumentRepository
        );
        injector
    }

    fn document(chat_id: Uuid, position: u32, content: &str) -> Document {
        Document {
            id: Uuid::new_v4(),
            chat_id,
            file_name: "notes.pdf".into(),
            position,
            page: Some(position + 1),
            content: content.into(),
        }
    }

    async fn create_chat(scope: &injector::injector_scope::InjectorScope<'_>) -> Uuid {
        let chat = Chat::new(None, "Chat".into());
        scope
            .resolve::<dyn AiRepository>()
            .await
            .upsert_chat(&chat)
            .await
            .unwrap();
        chat.id()
    }

    #[tokio::test]
    async fn find_candidates_query_returns_the_chats_matching_documents_in_order() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AiDocumentRepository>().await;
        let chat_id = create_chat(&scope).await;
        let other_chat_id = create_chat(&scope).await;
        let later = document(chat_id, 1, "The CELL wall");
        let earlier = document(chat_id, 0, "a cell");
        repository
            .insert(&[
                later.clone(),
                document(chat_id, 2, "nothing here"),
                earlier.clone(),
                document(other_chat_id, 0, "another cell"),
            ])
            .await
            .unwrap();

        // Act

        let actual = repository
            .find_candidates(chat_id, "cell", false)
            .await
            .unwrap();

        // Assert

        assert_eq!(vec![earlier, later], actual);
    }

    #[tokio::test]
    async fn next_position_chat_with_documents_returns_one_past_the_last() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AiDocumentRepository>().await;
        let chat_id = create_chat(&scope).await;
        let empty_chat_id = create_chat(&scope).await;
        repository
            .insert(&[document(chat_id, 0, "a"), document(chat_id, 4, "b")])
            .await
            .unwrap();

        // Act

        let actual = (
            repository.next_position(chat_id).await.unwrap(),
            repository.next_position(empty_chat_id).await.unwrap(),
        );

        // Assert

        assert_eq!((5, 0), actual);
    }

    #[tokio::test]
    async fn copy_to_chat_named_files_copied_under_new_ids() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AiDocumentRepository>().await;
        let chat_id = create_chat(&scope).await;
        let branch_id = create_chat(&scope).await;
        let original = document(chat_id, 0, "the cell");
        let unnamed = Document {
            file_name: "later.pdf".into(),
            ..document(chat_id, 1, "another cell")
        };
        repository
            .insert(&[original.clone(), unnamed])
            .await
            .unwrap();

        // Act

        repository
            .copy_to_chat(chat_id, branch_id, &["notes.pdf".to_string()])
            .await
            .unwrap();

        // Assert

        let copied = repository
            .find_candidates(branch_id, "cell", false)
            .await
            .unwrap();
        assert_eq!(1, copied.len());
        assert_ne!(original.id, copied[0].id);
        assert_eq!(
            Document {
                id: copied[0].id,
                chat_id: branch_id,
                ..original
            },
            copied[0]
        );
    }
}
