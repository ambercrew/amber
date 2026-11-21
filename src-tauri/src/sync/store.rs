use std::collections::HashSet;

use async_trait::async_trait;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::granularity::Granularity;

/// Local SQLite mechanics behind sync: registering tables, advancing the push/pull cursors and
/// applying remote batches. `SyncEngine` drives these into a cycle.
#[async_trait]
#[cfg_attr(test, mockall::automock)]
pub trait SyncStore: Send + Sync {
    /// Registers `table` at `granularity`, (re)creating its triggers, and persists `fk_constraints`' repair
    /// policies. Errors on a missing table, an unknown or `NOT NULL` `SetNull` column, or a changed granularity.
    async fn register_table(
        &self,
        table: &str,
        granularity: Granularity,
        fk_constraints: &[FkConstraint],
    ) -> Result<(), SyncError>;

    /// Sets when `apply_remote` refuses a remote delete of a `table` row, re-staging it so
    /// the push resurrects it everywhere. `None` clears it.
    async fn set_delete_guard(&self, table: &str, condition: Option<&str>)
    -> Result<(), SyncError>;

    /// This device's local cell changes not yet pushed to the server.
    async fn changes_since_last_push(&self) -> Result<ChangeBatch, SyncError>;

    /// Advances the local push cursor past `up_to_hlc`. Call only once the server
    /// has acknowledged the corresponding batch.
    async fn mark_pushed(&self, up_to_hlc: &Hlc) -> Result<(), SyncError>;

    async fn get_last_pulled_server_seq(&self) -> Result<Option<i64>, SyncError>;

    async fn set_last_pulled_server_seq(&self, seq: i64) -> Result<(), SyncError>;

    /// Merges one page of a remote batch (LWW by HLC) into the base tables, all or nothing. Call pages in
    /// order on the same instance, which buffers new rows' columns, with `is_last_page` on the last.
    async fn apply_remote(&self, batch: ChangeBatch, is_last_page: bool) -> Result<(), SyncError>;

    /// Attempts to materialize any row still buffered. Returns whether any
    /// remains; `false` means the changes so far are safe to commit.
    async fn has_pending_changes(&self) -> Result<bool, SyncError>;

    /// Whether any synced row violates a declared FK in the current transaction. A later page may still
    /// bring the parent, so pair it with `has_pending_changes` before committing.
    async fn has_unresolved_foreign_keys(&self) -> Result<bool, SyncError>;

    /// Publishes this device's latest migration, so a device behind it stops syncing.
    async fn record_local_schema_version(&self) -> Result<(), SyncError>;

    /// Whether the `table` row with this primary key was deleted, here or on another device.
    async fn is_row_deleted(&self, table: &str, primary_key: &str) -> Result<bool, SyncError>;

    /// The keys among `primary_keys` whose `table` row was deleted, in one query.
    async fn deleted_rows(
        &self,
        table: &str,
        primary_keys: &[String],
    ) -> Result<HashSet<String>, SyncError>;
}
