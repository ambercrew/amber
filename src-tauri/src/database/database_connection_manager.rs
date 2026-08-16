use std::path::Path;

use async_trait::async_trait;
use thiserror::Error;

#[cfg(test)]
use mockall::automock;

use crate::SourceError;
use crate::settings::value_objects::database_location::DatabaseLocation;

#[derive(Error, Debug)]
pub enum DatabaseConnectionManagerError {
    #[error("Failed to change the database")]
    ErrorChangingDatabase(#[source] SourceError),
    #[error("An unknown database error occurred")]
    Unknown(#[source] SourceError),
}

impl PartialEq for DatabaseConnectionManagerError {
    fn eq(&self, other: &Self) -> bool {
        std::mem::discriminant(self) == std::mem::discriminant(other)
    }
}

impl Eq for DatabaseConnectionManagerError {}

#[async_trait]
#[cfg_attr(test, automock)]
pub trait DatabaseConnectionManager: Send + Sync {
    async fn connect_to_database(
        &self,
        database_location: DatabaseLocation,
    ) -> Result<(), DatabaseConnectionManagerError>;

    async fn move_database_to(
        &self,
        new_database_location: DatabaseLocation,
    ) -> Result<(), DatabaseConnectionManagerError>;

    async fn copy_database_to(&self, path: &Path) -> Result<(), DatabaseConnectionManagerError>;

    /// Defers foreign key constraint checks on the current transaction until
    /// it commits, instead of enforcing them immediately on each statement.
    async fn disable_foreign_key_constraint_for_current_transaction(
        &self,
    ) -> Result<(), sqlx::Error>;

    /// Reverts `disable_foreign_key_constraint_for_current_transaction`,
    /// restoring immediate foreign key constraint enforcement.
    async fn enable_foreign_key_constraint_for_current_transaction(
        &self,
    ) -> Result<(), sqlx::Error>;
}
