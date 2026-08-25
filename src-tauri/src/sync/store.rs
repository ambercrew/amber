use async_trait::async_trait;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::granularity::Granularity;

/// Local SQLite-backed mechanics behind sync: registering tables for change
/// tracking, advancing the push/pull cursors, and applying a remote change
/// batch. `SyncEngine` drives these into a full cycle.
#[async_trait]
pub trait SyncStore: Send + Sync {
    /// Registers `table` for change tracking at the given granularity,
    /// (re)creating its sync triggers. Idempotent for the same granularity;
    /// errors if the table doesn't exist, has no single TEXT primary key, or was
    /// already registered at a different granularity.
    ///
    /// `fk_constraints` declares, per FK column, what `apply_remote`'s repair
    /// pass does with a row whose reference is dangling (see `FkPolicy`); it is
    /// persisted for later syncs. Errors if a constraint names an unknown column
    /// or pairs `FkPolicy::SetNull` with a `NOT NULL` one.
    async fn register_table(
        &self,
        table: &str,
        granularity: Granularity,
        fk_constraints: &[FkConstraint],
    ) -> Result<(), SyncError>;

    /// This device's local cell changes not yet pushed to the server.
    async fn changes_since_last_push(&self) -> Result<ChangeBatch, SyncError>;

    /// Advances the local push cursor past `up_to_hlc`. Call only once the server
    /// has acknowledged the corresponding batch.
    async fn mark_pushed(&self, up_to_hlc: &Hlc) -> Result<(), SyncError>;

    async fn get_last_pulled_server_seq(&self) -> Result<Option<i64>, SyncError>;

    async fn set_last_pulled_server_seq(&self, seq: i64) -> Result<(), SyncError>;

    /// Applies one page of a remote change batch: merges each cell against local
    /// state (last-writer-wins by HLC) and mirrors the winner into the base
    /// table. Column-mode updates for rows not yet existing locally are buffered
    /// on `self`, since a new row's columns may arrive split across pages and
    /// must be written in a single insert. Call in page order on the *same*
    /// instance — the buffer doesn't outlive it — passing `is_last_page = true`
    /// on the final call to flush it. All-or-nothing within a page.
    async fn apply_remote(&self, batch: ChangeBatch, is_last_page: bool) -> Result<(), SyncError>;

    /// Attempts to materialize any row still buffered. Returns whether any
    /// remains; `false` means the changes so far are safe to commit.
    async fn has_pending_changes(&self) -> Result<bool, SyncError>;

    /// Whether any synced-table row violates a declared FK (see
    /// `register_table`) in the current transaction. A dangling reference can
    /// still resolve when a later page brings the parent row, so callers pair
    /// this with `has_pending_changes` before committing.
    async fn has_unresolved_foreign_keys(&self) -> Result<bool, SyncError>;
}
