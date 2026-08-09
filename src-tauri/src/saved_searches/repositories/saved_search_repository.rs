use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;

#[async_trait]
pub trait SavedSearchRepository: Send + Sync {
    async fn create(&self, saved_search: &SavedSearch) -> Result<(), RepositoryError>;
    async fn update(&self, saved_search: &SavedSearch) -> Result<(), RepositoryError>;
    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<SavedSearch, RepositoryError>;
    async fn get_all(&self) -> Result<Vec<SavedSearch>, RepositoryError>;

    async fn get_filters(
        &self,
        saved_search_id: Uuid,
    ) -> Result<Vec<SavedSearchFilter>, RepositoryError>;

    /// Replaces the full ordered list of filters for a saved search.
    async fn replace_filters(
        &self,
        saved_search_id: Uuid,
        filters: &[SavedSearchFilter],
    ) -> Result<(), RepositoryError>;
}
