use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::ai_integration::repositories::ai_document_repository::AiDocumentRepository;
use crate::ai_integration::services::document_search_service::{
    DocumentMatch, DocumentSearchResults, DocumentSearchService,
};
use crate::common::repository_error::RepositoryError;
use crate::search::utils::text_matches::{SnippetWindow, find_matches, snippet};

#[derive(ScopeInjectable)]
pub struct DefaultDocumentSearchService {
    ai_document_repository: Arc<dyn AiDocumentRepository>,
}

#[async_trait]
impl DocumentSearchService for DefaultDocumentSearchService {
    async fn search(
        &self,
        chat_id: Uuid,
        query: &str,
        max_matches: usize,
        window: SnippetWindow,
    ) -> Result<DocumentSearchResults, RepositoryError> {
        let mut results = DocumentSearchResults::default();
        if query.is_empty() {
            return Ok(results);
        }
        let documents = self
            .ai_document_repository
            .find_candidates(chat_id, query, false)
            .await?;
        for document in documents {
            for range in find_matches(&document.content, query, false) {
                if results.matches.len() == max_matches {
                    results.truncated = true;
                    return Ok(results);
                }
                results.matches.push(DocumentMatch {
                    file_name: document.file_name.clone(),
                    page: document.page,
                    snippet: snippet(&document.content, range, window),
                });
            }
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::ai_integration::entities::chat::Chat;
    use crate::ai_integration::entities::document::Document;
    use crate::ai_integration::repositories::ai_repository::AiRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_ai_document_repository::SqliteAiDocumentRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_ai_repository::SqliteAiRepository;
    use crate::search::utils::text_matches::{SEARCH_RESULT_WINDOW, Snippet};
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
        register_scope!(
            injector,
            dyn DocumentSearchService,
            DefaultDocumentSearchService
        );
        injector
    }

    async fn create_chat_with(
        scope: &injector::injector_scope::InjectorScope<'_>,
        pages: &[&str],
    ) -> Uuid {
        let chat = Chat::new(None, "Chat".into());
        scope
            .resolve::<dyn AiRepository>()
            .await
            .upsert_chat(&chat)
            .await
            .unwrap();
        let documents: Vec<_> = pages
            .iter()
            .enumerate()
            .map(|(index, content)| Document {
                id: Uuid::new_v4(),
                chat_id: chat.id(),
                file_name: "notes.pdf".into(),
                position: index as u32,
                page: Some(index as u32 + 1),
                content: content.to_string(),
            })
            .collect();
        scope
            .resolve::<dyn AiDocumentRepository>()
            .await
            .insert(&documents)
            .await
            .unwrap();
        chat.id()
    }

    #[tokio::test]
    async fn search_matches_on_several_pages_returns_them_with_their_pages() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let chat_id = create_chat_with(&scope, &["The cell wall", "no match", "A Cell"]).await;
        let service = scope.resolve::<dyn DocumentSearchService>().await;

        // Act

        let actual = service
            .search(chat_id, "cell", 10, SEARCH_RESULT_WINDOW)
            .await
            .unwrap();

        // Assert

        let snippet = |before: &str, text: &str, after: &str| Snippet {
            before: before.into(),
            text: text.into(),
            after: after.into(),
        };
        assert_eq!(
            DocumentSearchResults {
                matches: vec![
                    DocumentMatch {
                        file_name: "notes.pdf".into(),
                        page: Some(1),
                        snippet: snippet("The ", "cell", " wall"),
                    },
                    DocumentMatch {
                        file_name: "notes.pdf".into(),
                        page: Some(3),
                        snippet: snippet("A ", "Cell", ""),
                    },
                ],
                truncated: false,
            },
            actual
        );
    }

    #[tokio::test]
    async fn search_more_matches_than_max_truncated_them() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let chat_id = create_chat_with(&scope, &["x x", "x"]).await;
        let service = scope.resolve::<dyn DocumentSearchService>().await;

        // Act

        let actual = service
            .search(chat_id, "x", 2, SEARCH_RESULT_WINDOW)
            .await
            .unwrap();

        // Assert

        assert_eq!((2, true), (actual.matches.len(), actual.truncated));
    }
}
