use std::collections::HashMap;
use std::sync::Arc;

use injector::injector::Injector;
use tokio::sync::Mutex;

use super::models::{PendingCell, RowKey};

/// Column-mode `SetColumn` cells buffered per `(tbl, row_id)` until they're
/// flushed into the base table as a single upsert. Buffering (rather than
/// materializing each cell as its own skeleton-insert-then-update) lets a
/// brand-new row's columns — which may arrive split across several pulled
/// pages — accumulate before the row is written, so the initial insert can
/// supply every column at once instead of tripping a `NOT NULL` column that
/// has no `DEFAULT`.
///
/// Registered as a per-DI-scope resource (see `register_scoped_pending_buffer`
/// in `create_injector.rs`) so it survives across repeated
/// `SyncEngine::apply_remote` calls made against the same engine instance
/// during one sync session.
#[derive(Default)]
pub(super) struct PendingBuffer {
    rows: Mutex<HashMap<RowKey, Vec<PendingCell>>>,
}

impl PendingBuffer {
    pub(super) async fn push(&self, tbl: &str, row_id: &str, col: String, value: Option<Vec<u8>>) {
        let key = RowKey {
            tbl: tbl.to_string(),
            row_id: row_id.to_string(),
        };
        let mut rows = self.rows.lock().await;
        rows.entry(key)
            .or_default()
            .push(PendingCell { col, value });
    }

    pub(super) async fn remove(&self, tbl: &str, row_id: &str) {
        let key = RowKey {
            tbl: tbl.to_string(),
            row_id: row_id.to_string(),
        };
        let mut rows = self.rows.lock().await;
        rows.remove(&key);
    }

    /// Drains and returns everything currently buffered.
    pub(super) async fn take_all(&self) -> HashMap<RowKey, Vec<PendingCell>> {
        let mut rows = self.rows.lock().await;
        std::mem::take(&mut *rows)
    }
}

/// Registers a fresh, empty `PendingBuffer` per DI scope, so it's shared by
/// every `PendingBuffer` resolution within one scope (one sync session) but
/// reset for the next.
pub(crate) fn register_scoped_pending_buffer(injector: &mut Injector) {
    injector.register_scope_factory::<PendingBuffer>(|_scope| {
        Box::pin(async move { Arc::new(PendingBuffer::default()) })
    });
}
