use thiserror::Error;

use crate::backend::clients::amber_backend_client::AmberBackendClientError;
use crate::database::transaction_manager::TransactionManagerError;
use crate::sync::post_sync_task::PostSyncTaskError;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("Table '{0}' does not exist")]
    TableNotFound(String),

    #[error("Table '{table}' has an invalid primary key: {details}")]
    InvalidPrimaryKey { table: String, details: String },

    #[error(
        "Table '{table}' is already registered with granularity '{existing}', cannot register with '{requested}'"
    )]
    GranularityMismatch {
        table: String,
        existing: String,
        requested: String,
    },

    #[error("Cell column '{col}' in table '{table}' does not match granularity '{granularity}'")]
    CellShapeMismatch {
        table: String,
        col: String,
        granularity: String,
    },

    #[error("Table '{0}' is not registered with the sync engine")]
    UnregisteredTable(String),

    #[error("Invalid HLC value: {0}")]
    InvalidHlc(String),

    #[error("Invalid granularity value: {0}")]
    InvalidGranularity(String),

    #[error("Invalid row payload for table '{table}': {reason}")]
    InvalidRowPayload { table: String, reason: String },

    #[error("Unknown column '{col}' in table '{table}'")]
    UnknownColumn { table: String, col: String },

    #[error("Invalid FK policy for '{table}.{col}': {reason}")]
    InvalidFkPolicy {
        table: String,
        col: String,
        reason: String,
    },

    #[error("Invalid FK policy value: {0}")]
    InvalidFkPolicyValue(String),

    #[error("Foreign key repair did not converge for the synced tables")]
    FkRepairDidNotConverge,

    #[error("Database error")]
    Database(#[from] sqlx::Error),

    #[error("Sync request to the backend failed: {0}")]
    Backend(#[from] AmberBackendClientError),

    #[error("A post-sync task failed: {0}")]
    PostSyncTask(#[from] PostSyncTaskError),

    #[error("Failed to commit sync progress")]
    Transaction(#[from] TransactionManagerError),
}
