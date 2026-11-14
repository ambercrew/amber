use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::entities::content_search_results::ContentSearchResults;
use crate::search::utils::text_matches::SnippetWindow;

#[async_trait]
pub trait ContentSearchService: Send + Sync {
    /// Every match of `query` in live elements' content, as a substring anywhere in a word.
    /// `None` when `is_superseded` turned true first, as it's checked between batches of texts.
    async fn search_content(
        &self,
        query: &str,
        case_sensitive: bool,
        is_superseded: &(dyn Fn() -> bool + Send + Sync),
    ) -> Result<Option<ContentSearchResults>, RepositoryError>;

    /// The first `max_matches` matches of `query` in one element's content, without its name,
    /// each with `window` characters of its line around it.
    async fn search_element_content(
        &self,
        element_id: ElementId,
        query: &str,
        case_sensitive: bool,
        max_matches: usize,
        window: SnippetWindow,
    ) -> Result<ContentSearchResults, RepositoryError>;

    /// Whether the element has stored text to search;
    async fn has_searchable_text(&self, element_id: ElementId) -> Result<bool, RepositoryError>;
}
