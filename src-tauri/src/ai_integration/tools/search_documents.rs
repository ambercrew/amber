use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::{
    entities::message::{Message, MessageContent},
    prompts::SEARCH_DOCUMENTS_DESCRIPTION,
    services::document_search_service::DocumentSearchService,
    tools::{app_tool::AppTool, search_open_element::SNIPPET_WINDOW},
};
use crate::common::repository_error::RepositoryError;

/// Caps the matches one search adds to the context, whatever the model asks for.
pub const MAX_RESULTS: u32 = 20;

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentsArgs {
    #[schemars(
        description = "Text to find, matched exactly anywhere in a word and ignoring case; a word or short phrase works best."
    )]
    pub query: String,
    #[schemars(description = "The maximum number of matches to return, usually 5-10; at most 20.")]
    pub max_results: u32,
}

/// One match, with up to `SNIPPET_WINDOW` characters of the text on each side.
#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentsMatch {
    pub file_name: String,
    /// The 1-based PDF page; absent for other files.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    pub before: String,
    pub text: String,
    pub after: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentsOutput {
    /// In upload order, then reading order.
    pub matches: Vec<SearchDocumentsMatch>,
    /// True when the files have more matches than were returned.
    pub truncated: bool,
}

#[derive(Error, Debug)]
pub enum SearchDocumentsError {
    #[error("Failed to search the uploaded files")]
    Search(#[from] RepositoryError),
}

pub struct SearchDocuments {
    chat_id: Uuid,
    document_search_service: Arc<dyn DocumentSearchService>,
}

impl SearchDocuments {
    pub fn new(document_search_service: Arc<dyn DocumentSearchService>, chat_id: Uuid) -> Self {
        Self {
            document_search_service,
            chat_id,
        }
    }
}

impl Tool for SearchDocuments {
    const NAME: &'static str = "search_documents";

    type Error = SearchDocumentsError;
    type Args = SearchDocumentsArgs;
    type Output = SearchDocumentsOutput;

    fn description(&self) -> String {
        SEARCH_DOCUMENTS_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::to_value(schema_for!(SearchDocumentsArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let max_results = args.max_results.clamp(1, MAX_RESULTS) as usize;
        let results = self
            .document_search_service
            .search(self.chat_id, &args.query, max_results, SNIPPET_WINDOW)
            .await?;

        Ok(SearchDocumentsOutput {
            matches: results
                .matches
                .into_iter()
                .map(|found| SearchDocumentsMatch {
                    file_name: found.file_name,
                    page: found.page,
                    before: found.snippet.before,
                    text: found.snippet.text,
                    after: found.snippet.after,
                })
                .collect(),
            truncated: results.truncated,
        })
    }
}

impl AppTool for SearchDocuments {
    const REQUIRES_APPROVAL: bool = false;

    /// Only chats with an uploaded document have anything to search.
    fn is_applicable(&self, messages: &[Message]) -> bool {
        messages
            .iter()
            .any(|m| matches!(m.content(), MessageContent::Document(_)))
    }
}

#[cfg(test)]
pub mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::ai_integration::entities::chat::Chat;
    use crate::ai_integration::entities::document::Document;
    use crate::ai_integration::entities::message::DocumentContent;
    use crate::ai_integration::repositories::ai_document_repository::AiDocumentRepository;
    use crate::ai_integration::repositories::ai_repository::AiRepository;
    use crate::ai_integration::services::implementations::default_document_search_service::DefaultDocumentSearchService;
    use crate::infrastructure::repositories::sqlite::sqlite_ai_document_repository::SqliteAiDocumentRepository;
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
        register_scope!(
            injector,
            dyn DocumentSearchService,
            DefaultDocumentSearchService
        );
        injector
    }

    async fn create_tool(
        scope: &injector::injector_scope::InjectorScope<'_>,
        pages: &[&str],
    ) -> SearchDocuments {
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
        SearchDocuments::new(
            scope.resolve::<dyn DocumentSearchService>().await,
            chat.id(),
        )
    }

    fn args(query: &str, max_results: u32) -> SearchDocumentsArgs {
        SearchDocumentsArgs {
            query: query.into(),
            max_results,
        }
    }

    #[tokio::test]
    pub async fn call_matching_pages_returned_matches_with_file_and_page() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tool = create_tool(&scope, &["Nothing", "The cell wall is rigid"]).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("WALL", 5))
            .await
            .unwrap();

        // Assert

        assert_eq!(
            SearchDocumentsOutput {
                matches: vec![SearchDocumentsMatch {
                    file_name: "notes.pdf".into(),
                    page: Some(2),
                    before: "The cell ".into(),
                    text: "wall".into(),
                    after: " is rigid".into(),
                }],
                truncated: false,
            },
            actual
        );
    }

    #[tokio::test]
    pub async fn call_max_results_above_cap_clamped_to_cap() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let text = "x ".repeat(MAX_RESULTS as usize + 5);
        let tool = create_tool(&scope, &[&text]).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("x", 1000))
            .await
            .unwrap();

        // Assert

        assert_eq!(
            (MAX_RESULTS as usize, true),
            (actual.matches.len(), actual.truncated)
        );
    }

    #[tokio::test]
    pub async fn is_applicable_chat_with_uploaded_document_returned_true_only_then() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tool = create_tool(&scope, &[]).await;
        let chat_id = Uuid::new_v4();
        let document = Message::new(
            None,
            chat_id,
            MessageContent::Document(DocumentContent {
                file_name: "notes.pdf".into(),
            }),
        );
        let human = Message::new(None, chat_id, MessageContent::Human("Hi".into()));

        // Act

        let actual = (
            tool.is_applicable(&[human.clone(), document]),
            tool.is_applicable(&[human]),
        );

        // Assert

        assert_eq!((true, false), actual);
    }
}
