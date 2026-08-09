use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::search::entities::element_search_result::ElementSearchResult;

#[async_trait]
pub trait SearchRepository: Send + Sync {
    /// Live elements matching every one of the given filters, ordered by
    /// priority ascending (front of queue first).
    async fn search(
        &self,
        filters: &[ElementFilter],
    ) -> Result<Vec<ElementSearchResult>, RepositoryError>;
}
