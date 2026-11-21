use async_trait::async_trait;
use uuid::Uuid;

use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
use crate::common::repository_error::RepositoryError;

#[async_trait]
pub trait BibliographicalSourceRepository: Send + Sync {
    async fn create(&self, source: &BibliographicalSource) -> Result<(), RepositoryError>;
    async fn update(&self, source: &BibliographicalSource) -> Result<(), RepositoryError>;
    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<BibliographicalSource, RepositoryError>;
    async fn get_all(&self) -> Result<Vec<BibliographicalSource>, RepositoryError>;

    /// The source at exactly `location`, to deduplicate re-imports; one without a
    /// location never matches.
    async fn find_by_location(
        &self,
        location: &str,
    ) -> Result<Option<BibliographicalSource>, RepositoryError>;
}
