use std::collections::HashSet;

use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::search::entities::element_search_result::ElementSearchResult;
use crate::search::value_objects::search_sort::SearchSort;

#[async_trait]
pub trait SearchRepository: Send + Sync {
    /// Live elements matching every one of the given filters, ordered by
    /// `sort` (ties by priority), capped at `limit` if given.
    async fn search(
        &self,
        filters: &[ElementFilter],
        sort: SearchSort,
        limit: Option<u32>,
    ) -> Result<Vec<ElementSearchResult>, RepositoryError>;

    /// Ids of the live elements matching every filter, skipping sorting, tags and
    /// (unless a priority filter needs it) priority info.
    async fn matching_ids(
        &self,
        filters: &[ElementFilter],
    ) -> Result<HashSet<ElementId>, RepositoryError>;
}
