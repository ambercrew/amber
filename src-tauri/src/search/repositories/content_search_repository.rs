use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::value_objects::content_part::ContentPartRef;

#[async_trait]
pub trait ContentSearchRepository: Send + Sync {
    /// Live elements' content parts that may contain `query`, by priority then part order.
    /// May include parts that don't (callers match exactly), never leaves one out.
    async fn find_candidate_parts(
        &self,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<ContentPartRef>, RepositoryError>;

    /// Like `find_candidate_parts`, but only `element_id`'s parts, in part order.
    async fn find_element_candidate_parts(
        &self,
        element_id: ElementId,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<ContentPartRef>, RepositoryError>;

    /// Whether the element has stored text to search;
    async fn has_text(&self, element_id: ElementId) -> Result<bool, RepositoryError>;

    /// The plain text of each part, in the given order (empty for a part that's gone).
    async fn get_part_texts(
        &self,
        parts: &[ContentPartRef],
    ) -> Result<Vec<String>, RepositoryError>;

    /// Each element's name, in the given order (empty for an element that's gone).
    async fn get_names(&self, element_ids: &[ElementId]) -> Result<Vec<String>, RepositoryError>;
}
