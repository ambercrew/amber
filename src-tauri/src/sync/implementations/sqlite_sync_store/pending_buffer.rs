use std::collections::HashMap;
use std::sync::Arc;

use injector::injector::Injector;
use tokio::sync::Mutex;

use super::models::{PendingCell, RowKey};

/// Column-mode `SetColumn` cells buffered per `(tbl, row_id)` until flushed into
/// the base table as a single upsert, so a new row's columns — which may arrive
/// split across pages — are all supplied by the initial insert instead of
/// tripping a `NOT NULL` column with no `DEFAULT`.
///
/// Per-DI-scope (`register_scoped_pending_buffer`), so it survives repeated
/// `SyncEngine::apply_remote` calls within one sync session.
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

    pub(super) async fn is_empty(&self) -> bool {
        self.rows.lock().await.is_empty()
    }

    /// Clones everything buffered without draining it, so a caller can leave the
    /// rows that still fail to materialize buffered for a later page.
    pub(super) async fn snapshot(&self) -> HashMap<RowKey, Vec<PendingCell>> {
        self.rows.lock().await.clone()
    }
}

/// Registers a fresh, empty `PendingBuffer` per DI scope — shared within one
/// sync session but reset for the next.
pub(crate) fn register_scoped_pending_buffer(injector: &mut Injector) {
    injector.register_scope_factory::<PendingBuffer>(|_scope| {
        Box::pin(async move { Arc::new(PendingBuffer::default()) })
    });
}
