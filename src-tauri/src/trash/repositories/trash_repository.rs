use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::trash::value_objects::trashed_element::TrashedElement;

#[async_trait]
pub trait TrashRepository: Send + Sync {
    /// Trashes the element and its subtree as a new trash root; descendants trashed on their own keep their
    /// root and time, so a restore doesn't bring them back. Returns the ids newly trashed.
    async fn trash(
        &self,
        id: ElementId,
        trashed_at: DateTime<Utc>,
    ) -> Result<Vec<ElementId>, RepositoryError>;

    /// Restores the element and the subtree trashed with it, leaving descendants that are trash roots
    /// themselves. Returns the ids restored.
    async fn restore(&self, id: ElementId) -> Result<Vec<ElementId>, RepositoryError>;

    /// The elements the user explicitly trashed, most recently trashed first.
    async fn get_trashed_roots(&self) -> Result<Vec<TrashedElement>, RepositoryError>;

    /// Ids of the trash roots trashed strictly before `cutoff`.
    async fn get_roots_trashed_before(
        &self,
        cutoff: DateTime<Utc>,
    ) -> Result<Vec<ElementId>, RepositoryError>;

    async fn trash_descendants_of_trashed(&self) -> Result<Vec<ElementId>, RepositoryError>;

    async fn is_trashed(&self, id: ElementId) -> Result<bool, RepositoryError>;

    async fn has_live_ancestry(&self, id: ElementId) -> Result<bool, RepositoryError>;
}
