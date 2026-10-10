use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::search::entities::element_search_result::ElementSearchResult;
use crate::search::value_objects::search_sort::SearchSort;

#[async_trait]
pub trait SearchService: Send + Sync {
    async fn search_elements(
        &self,
        filters: Vec<ElementFilter>,
        sort: SearchSort,
        limit: Option<u32>,
    ) -> Result<Vec<ElementSearchResult>, RepositoryError>;
}
