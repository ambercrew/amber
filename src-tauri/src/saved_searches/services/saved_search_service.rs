use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;

#[async_trait]
pub trait SavedSearchService: Send + Sync {
    async fn list_saved_searches(&self) -> Result<Vec<SavedSearch>, RepositoryError>;

    /// Filters are fetched on their own, separately from the saved search's metadata.
    async fn get_saved_search_filters(
        &self,
        id: Uuid,
    ) -> Result<Vec<SavedSearchFilter>, RepositoryError>;

    async fn create_saved_search(
        &self,
        name: String,
        filters: Vec<SavedSearchFilter>,
    ) -> Result<SavedSearch, RepositoryError>;

    /// Name-only edit; filters are left untouched.
    async fn rename_saved_search(
        &self,
        id: Uuid,
        name: String,
    ) -> Result<SavedSearch, RepositoryError>;

    /// Replaces the filters of an existing saved search; name is left untouched.
    async fn update_saved_search_filters(
        &self,
        id: Uuid,
        filters: Vec<SavedSearchFilter>,
    ) -> Result<(), RepositoryError>;

    /// Creates a copy named `"{name} (copy)"`, filters included.
    async fn duplicate_saved_search(&self, id: Uuid) -> Result<SavedSearch, RepositoryError>;

    async fn delete_saved_search(&self, id: Uuid) -> Result<(), RepositoryError>;
}
