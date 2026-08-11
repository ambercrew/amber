use async_trait::async_trait;
use thiserror::Error;

use crate::common::repository_error::RepositoryError;
use crate::elements::services::element_move_error::ElementMoveError;
use crate::elements::services::priority_service::PriorityError;
use crate::elements::value_objects::element_id::ElementId;
use crate::trash::value_objects::trashed_element::TrashedElement;

pub const DEFAULT_TRASH_RETENTION_DAYS: u32 = 30;

/// How often the background task looks for trashed elements that are past the
/// retention threshold.
pub const TIME_BETWEEN_TRASH_PURGES_IN_MINUTES: u64 = 12 * 60;

#[async_trait]
pub trait TrashService: Send + Sync {
    /// Moves the element and its subtree to the trash. Descendants already
    /// trashed on their own are left alone, so restoring this element later
    /// doesn't bring them back with it.
    async fn trash_element(&self, id: ElementId) -> Result<(), TrashServiceError>;

    /// Same as `trash_element`, applied to every element in `ids`.
    async fn trash_many(&self, ids: Vec<ElementId>) -> Result<(), TrashServiceError>;

    /// Restores a trashed element and its subtree. An element whose ancestry
    /// is missing or still trashed comes back at the root instead.
    async fn restore_element(&self, id: ElementId) -> Result<(), TrashServiceError>;

    /// The elements the user explicitly trashed, most recently trashed first.
    async fn list_trash(&self) -> Result<Vec<TrashedElement>, TrashServiceError>;

    async fn delete_permanently(&self, id: ElementId) -> Result<(), TrashServiceError>;

    async fn empty_trash(&self) -> Result<(), TrashServiceError>;

    /// Permanently deletes trash roots older than `retention_days`. Returns
    /// the number of roots purged.
    async fn purge_expired(&self, retention_days: u32) -> Result<usize, TrashServiceError>;
}

#[derive(Debug, Error)]
pub enum TrashServiceError {
    #[error("Only elements that are in the trash can be deleted permanently")]
    NotInTrash,

    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    Move(#[from] ElementMoveError),

    #[error(transparent)]
    Priority(#[from] PriorityError),
}
