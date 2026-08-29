use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;

use thiserror::Error;

use crate::common::repository_error::RepositoryError;

/// A repair that runs once at the end of every sync cycle, after remote cells
/// have been applied and before local changes are pushed.
///
/// Cell-level last-writer-wins can leave a database that is internally
/// consistent per row yet breaks an invariant spanning several rows (two rows
/// both flagged as the single default study profile, say). Rather than teach
/// the sync engine about domain rules, each domain module contributes a task
/// here; the engine only sequences them.
///
/// A task must be **deterministic**: given the same rows it must pick the same
/// outcome on every device, since every device runs it independently on its own
/// copy of the data. Derive the decision from synced, immutable columns
/// (`created_at`, `id`) — never from local wall-clock time, row order, or
/// anything a local trigger rewrites.
#[cfg_attr(test, automock)]
#[async_trait]
pub trait PostSyncTask: Send + Sync {
    /// Human-readable name, used only for logging.
    fn name(&self) -> &'static str;

    async fn run(&self) -> Result<(), PostSyncTaskError>;
}

#[derive(Debug, Error)]
pub enum PostSyncTaskError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error("Database error")]
    Database(#[from] sqlx::Error),
}
