use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;

use thiserror::Error;

use crate::common::repository_error::RepositoryError;

/// A repair run after applying remote cells and before pushing, for invariants spanning rows that
/// cell-level LWW can break. Must be deterministic: decide from `created_at`/`id`, never local time.
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
