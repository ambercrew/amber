use async_trait::async_trait;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::granularity::Granularity;

#[async_trait]
pub trait SyncEngine: Send + Sync {
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

    /// Applies a batch of remote cell changes: for each cell, merges it against
    /// local state (last-writer-wins by HLC) and, if it wins, mirrors the change
    /// into the base table. All-or-nothing within the batch — any error aborts and
    /// the caller's transaction rollback discards every write from this call.
    async fn apply_remote(&self, batch: ChangeBatch) -> Result<(), SyncError>;
}
