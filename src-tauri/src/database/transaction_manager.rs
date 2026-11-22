use async_trait::async_trait;
use thiserror::Error;

#[cfg(test)]
use mockall::automock;

use crate::SourceError;

#[derive(Error, Debug)]
pub enum TransactionManagerError {
    #[error("Failed to commit the current transaction")]
    CommitFailed(#[source] SourceError),
}

/// Commits the scope's transaction and opens a fresh one without ending the scope, then emits the
/// events queued during it.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait TransactionManager: Send + Sync {
    async fn save_changes(&self) -> Result<(), TransactionManagerError>;
}
