use async_trait::async_trait;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::granularity::Granularity;

/// Local SQLite-backed mechanics behind sync: registering tables for change
/// tracking, reading and advancing the push/pull cursors, and applying a
/// remote change batch against the base tables. `SyncEngine` orchestrates
/// these together with `AmberBackendClient` into a full sync cycle.
#[async_trait]
pub trait SyncStore: Send + Sync {
    /// Registers `table` for change tracking at the given granularity, (re)creating
    /// its sync triggers. Idempotent when called again with the same granularity;
    /// errors if the table doesn't exist, has no single TEXT primary key, or was
    /// already registered with a different granularity.
    async fn register_table(&self, table: &str, granularity: Granularity) -> Result<(), SyncError>;

    /// This device's local cell changes not yet pushed to the server.
    async fn changes_since_last_push(&self) -> Result<ChangeBatch, SyncError>;

    /// Advances the local push cursor past `up_to_hlc`. Call only after the server
    /// has acknowledged receipt of the corresponding batch.
    async fn mark_pushed(&self, up_to_hlc: &Hlc) -> Result<(), SyncError>;

    async fn get_last_pulled_server_seq(&self) -> Result<Option<i64>, SyncError>;

    async fn set_last_pulled_server_seq(&self, seq: i64) -> Result<(), SyncError>;

    /// Applies one page of a remote change batch: for each cell, merges it
    /// against local state (last-writer-wins by HLC) and, if it wins, mirrors
    /// the change into the base table. Column-mode updates for rows that don't
    /// exist locally yet are buffered (kept on this engine instance) rather
    /// than materialized immediately, so that a new row's columns — which may
    /// arrive split across pages — can be written in a single insert once
    /// they're all available. Call repeatedly, in page order, against the
    /// *same* engine instance (the buffer lives on `self` and does not survive
    /// across instances); for a caller with only one page, pass
    /// `is_last_page = true` on that single call. Pass `is_last_page = true`
    /// on the final call to flush whatever is still buffered — a row still
    /// missing a required column at that point surfaces as a constraint error
    /// from the flush itself. All-or-nothing within a page — any error aborts
    /// and the caller's transaction rollback discards every write from this
    /// call.
    async fn apply_remote(&self, batch: ChangeBatch, is_last_page: bool) -> Result<(), SyncError>;

    /// Attempts to materialize any row still buffered from a page applied so
    /// far (a row can already have every `NOT NULL` column it needs even
    /// though the page it arrived on wasn't marked as the last one). Returns
    /// whether any row is still buffered afterwards; `false` means the
    /// changes applied up to this point are self-contained and safe to
    /// commit.
    async fn has_pending_changes(&self) -> Result<bool, SyncError>;
}
