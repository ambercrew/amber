use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::SEARCH_OPEN_ELEMENT_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::services::content_search_service::ContentSearchService;
use crate::search::utils::text_matches::SnippetWindow;

/// Caps the matches one search adds to the context, whatever the model asks for.
pub const MAX_RESULTS: u32 = 20;
/// Enough of a match's surroundings to understand it; at the cap, a call stays near 12k characters.
pub const SNIPPET_WINDOW: SnippetWindow = SnippetWindow {
    before: 300,
    after: 300,
};

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpenElementArgs {
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
pub struct SearchOpenElementMatch {
    pub before: String,
    pub text: String,
    pub after: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpenElementOutput {
    pub element_id: ElementId,
    /// Matches in reading order.
    pub matches: Vec<SearchOpenElementMatch>,
    /// True when the element has more matches than were returned.
    pub truncated: bool,
}

#[derive(Error, Debug)]
pub enum SearchOpenElementError {
    #[error("The chat has no open element with text to search")]
    NoElement,
    #[error("Failed to search the open element")]
    Search(#[from] RepositoryError),
}

pub struct SearchOpenElement {
    content_search_service: Arc<dyn ContentSearchService>,
    element: Option<ElementId>,
}

impl SearchOpenElement {
    /// `element` is the chat's open element; the tool is only offered when it has text (not a folder or PDF).
    pub async fn new(
        content_search_service: Arc<dyn ContentSearchService>,
        element: Option<ElementId>,
    ) -> Result<Self, RepositoryError> {
        let element = match element {
            Some(ElementId::Folder(_)) | None => None,
            Some(element) if content_search_service.has_searchable_text(element).await? => {
                Some(element)
            }
            Some(_) => None,
        };
        Ok(Self {
            content_search_service,
            element,
        })
    }
}

impl Tool for SearchOpenElement {
    const NAME: &'static str = "search_open_element";

    type Error = SearchOpenElementError;
    type Args = SearchOpenElementArgs;
    type Output = SearchOpenElementOutput;

    fn description(&self) -> String {
        SEARCH_OPEN_ELEMENT_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(SearchOpenElementArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let element_id = self.element.ok_or(SearchOpenElementError::NoElement)?;
        let max_results = args.max_results.clamp(1, MAX_RESULTS) as usize;

        let results = self
            .content_search_service
            .search_element_content(element_id, &args.query, false, max_results, SNIPPET_WINDOW)
            .await?;

        Ok(SearchOpenElementOutput {
            element_id,
            matches: results
                .elements
                .into_iter()
                .flat_map(|element| element.matches)
                .map(|content_match| SearchOpenElementMatch {
                    before: content_match.snippet.before,
                    text: content_match.snippet.text,
                    after: content_match.snippet.after,
                })
                .collect(),
            truncated: results.truncated,
        })
    }
}

impl AppTool for SearchOpenElement {
    const REQUIRES_APPROVAL: bool = false;

    fn is_applicable(&self, _messages: &[Message]) -> bool {
        self.element.is_some()
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::injector_scope::InjectorScope;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::entities::extract::Extract;
    use crate::elements::repositories::extract_repository::ExtractRepository;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::infrastructure::repositories::sqlite::sqlite_content_search_repository::SqliteContentSearchRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::search::repositories::content_search_repository::ContentSearchRepository;
    use crate::search::services::implementations::default_content_search_service::DefaultContentSearchService;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(
            injector,
            dyn ContentSearchRepository,
            SqliteContentSearchRepository
        );
        register_scope!(
            injector,
            dyn ContentSearchService,
            DefaultContentSearchService
        );
        injector
    }

    async fn create_tool(
        scope: &InjectorScope<'_>,
        element: Option<ElementId>,
    ) -> SearchOpenElement {
        SearchOpenElement::new(scope.resolve::<dyn ContentSearchService>().await, element)
            .await
            .unwrap()
    }

    async fn create_extract(scope: &InjectorScope<'_>, text: &str) -> ElementId {
        let element_id = ElementId::Extract(Uuid::new_v4());
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(Extract {
                meta: Meta {
                    element_id,
                    name: "Extract".into(),
                    name_source: NameSource::Manual,
                    suspended: false,
                    parent: None,
                    position: FractionalIndex::default(),
                    priority: FractionalIndex::default(),
                    derived_from: None,
                    study_profile_id: None,
                    bibliographical_source_id: None,
                    created_at: Utc::now(),
                    modified_at: Utc::now(),
                },
                content: format!(
                    r#"{{"root":{{"children":[{{"type":"paragraph","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
                ),
                interval_multiplier: 1.2,
            })
            .await
            .unwrap();
        element_id
    }

    fn args(query: &str, max_results: u32) -> SearchOpenElementArgs {
        SearchOpenElementArgs {
            query: query.into(),
            max_results,
        }
    }

    #[tokio::test]
    async fn call_open_extract_returned_its_matches_with_snippets() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_extract(&scope, "The cell wall is rigid").await;
        create_extract(&scope, "Another wall elsewhere").await;
        let tool = create_tool(&scope, Some(element_id)).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("WALL", 5))
            .await
            .unwrap();

        // Assert

        assert_eq!(
            SearchOpenElementOutput {
                element_id,
                matches: vec![SearchOpenElementMatch {
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
    async fn call_more_matches_than_max_results_truncated_them() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_extract(&scope, "x x x").await;
        let tool = create_tool(&scope, Some(element_id)).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("x", 2))
            .await
            .unwrap();

        // Assert

        assert_eq!((2, true), (actual.matches.len(), actual.truncated));
    }

    #[tokio::test]
    async fn call_max_results_above_cap_clamped_to_cap() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_extract(&scope, &"x ".repeat(MAX_RESULTS as usize + 5)).await;
        let tool = create_tool(&scope, Some(element_id)).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("x", 1000))
            .await
            .unwrap();

        // Assert

        assert_eq!(MAX_RESULTS as usize, actual.matches.len());
    }

    #[tokio::test]
    async fn call_long_paragraph_cut_context_to_window_with_ellipses() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let filler = "a".repeat(SNIPPET_WINDOW.before + 50);
        let element_id = create_extract(&scope, &format!("{filler} needle {filler}")).await;
        let tool = create_tool(&scope, Some(element_id)).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("needle", 1))
            .await
            .unwrap();

        // Assert

        let found = &actual.matches[0];
        assert_eq!(
            (
                true,
                true,
                SNIPPET_WINDOW.before + 1,
                SNIPPET_WINDOW.after + 1
            ),
            (
                found.before.starts_with('…'),
                found.after.ends_with('…'),
                found.before.chars().count(),
                found.after.chars().count(),
            )
        );
    }

    #[tokio::test]
    async fn is_applicable_open_extract_returned_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_extract(&scope, "text").await;
        let tool = create_tool(&scope, Some(element_id)).await;

        // Act

        let actual = tool.is_applicable(&[]);

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn is_applicable_folder_textless_or_no_element_returned_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        // A learning asset with no splits, like a PDF.
        let textless = create_tool(&scope, Some(ElementId::LearningAsset(Uuid::new_v4()))).await;
        let folder = create_tool(&scope, Some(ElementId::Folder(Uuid::new_v4()))).await;
        let none = create_tool(&scope, None).await;

        // Act

        let actual = (
            textless.is_applicable(&[]),
            folder.is_applicable(&[]),
            none.is_applicable(&[]),
        );

        // Assert

        assert_eq!((false, false, false), actual);
    }
}
