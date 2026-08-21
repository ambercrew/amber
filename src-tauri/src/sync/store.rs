use async_trait::async_trait;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::granularity::Granularity;

/// Local SQLite-backed mechanics behind sync: registering tables for change
/// tracking, reading and advancing the push/pull cursors, and applying a
/// remote change batch against the base tables. `SyncEngine` orchestrates
/// these together with `AmberBackendClient` into a full sync cycle.
#[async_trait]
pub trait SyncStore: Send + Sync {
    /// Registers `table` for change tracking at the given granularity,
    /// (re)creating its sync triggers. Idempotent for the same granularity;
    /// errors if the table doesn't exist, has no single TEXT primary key, or
    /// was already registered at a different granularity.
    ///
    /// `fk_constraints` declares, per FK column, what to do with a row whose
    /// reference turns out dangling once a full sync pass confirms it (see
    /// `FkPolicy` and `apply_remote`'s `is_last_page` repair pass); persisted
    /// so it's available to later syncs in other scopes. Errors if a
    /// constraint names a nonexistent column, or pairs `FkPolicy::SetNull`
    /// with a `NOT NULL` column.
    async fn register_table(
        &self,
        table: &str,
        granularity: Granularity,
        fk_constraints: &[FkConstraint],
    ) -> Result<(), SyncError>;

    /// This device's local cell changes not yet pushed to the server.
    async fn changes_since_last_push(&self) -> Result<ChangeBatch, SyncError>;

    /// Advances the local push cursor past `up_to_hlc`. Call only after the server
    /// has acknowledged receipt of the corresponding batch.
    async fn mark_pushed(&self, up_to_hlc: &Hlc) -> Result<(), SyncError>;

    async fn get_last_pulled_server_seq(&self) -> Result<Option<i64>, SyncError>;

    async fn set_last_pulled_server_seq(&self, seq: i64) -> Result<(), SyncError>;

    /// Applies one page of a remote change batch: merges each cell against
    /// local state (last-writer-wins by HLC) and, if it wins, mirrors the
    /// change into the base table. Column-mode updates for rows not yet
    /// existing locally are buffered on `self` rather than materialized
    /// immediately, since a new row's columns may arrive split across pages
    /// and need writing in a single insert once complete. Call repeatedly, in
    /// page order, on the *same* engine instance — the buffer doesn't survive
    /// across instances. Pass `is_last_page = true` on the final call (or the
    /// only call, for a single-page caller) to flush the buffer; a row still
    /// missing a required column at that point surfaces as a constraint
    /// error. All-or-nothing within a page: any error aborts and the caller's
    /// transaction rollback discards every write from this call.
    async fn apply_remote(&self, batch: ChangeBatch, is_last_page: bool) -> Result<(), SyncError>;

    /// Attempts to materialize any row still buffered from a page applied so
    /// far. Returns whether any row is still buffered afterwards; `false`
    /// means the changes applied so far are self-contained and safe to
    /// commit.
    async fn has_pending_changes(&self) -> Result<bool, SyncError>;

    /// Whether any synced-table row currently violates a declared FK (see
    /// `register_table`'s `fk_constraints`) within the current transaction. A
    /// dangling reference can still resolve once a later page brings the
    /// missing parent row (`apply_remote`'s repair pass runs on
    /// `is_last_page`), so callers pair this with `has_pending_changes` to
    /// decide whether progress so far is safe to commit.
    async fn has_unresolved_foreign_keys(&self) -> Result<bool, SyncError>;
}
