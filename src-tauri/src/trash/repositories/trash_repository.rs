use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::trash::value_objects::trashed_element::TrashedElement;

#[async_trait]
pub trait TrashRepository: Send + Sync {
    /// Moves the element and its subtree to the trash. The element becomes a
    /// trash root; descendants already trashed on their own keep their own
    /// root and timestamp instead of being resurrected on restore.
    async fn trash(&self, id: ElementId, trashed_at: DateTime<Utc>) -> Result<(), RepositoryError>;

    /// Restores the element and the subtree trashed with it. Descendants that
    /// are trash roots of their own stay behind. Returns the ids that were
    /// actually restored.
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
