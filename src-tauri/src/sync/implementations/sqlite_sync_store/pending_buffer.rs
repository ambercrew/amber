use std::collections::HashMap;
use std::sync::Arc;

use injector::injector::Injector;
use tokio::sync::Mutex;

use super::models::{PendingCell, RowKey};

/// Column-mode cells buffered per `(tbl, row_id)` until one upsert can supply a new row's columns,
/// which may span pages. Scoped per DI scope, so it lasts across one session's `apply_remote` calls.
#[derive(Default)]
pub(super) struct PendingBuffer {
    rows: Mutex<HashMap<RowKey, BufferedRow>>,
}

#[derive(Default)]
struct BufferedRow {
    cells: Vec<PendingCell>,
    /// How many of `cells`, from the start, `sync_pending_cells` already holds.
    persisted: usize,
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
            .cells
            .push(PendingCell { col, value });
    }

    /// Removes and returns the row's buffered cells, in the order they were pushed.
    pub(super) async fn take(&self, tbl: &str, row_id: &str) -> Vec<PendingCell> {
        let key = RowKey {
            tbl: tbl.to_string(),
            row_id: row_id.to_string(),
        };
        let mut rows = self.rows.lock().await;
        rows.remove(&key).map(|row| row.cells).unwrap_or_default()
    }

    pub(super) async fn is_empty(&self) -> bool {
        self.rows.lock().await.is_empty()
    }

    /// Clones everything buffered without draining it, so a caller can leave the
    /// rows that still fail to materialize buffered for a later page.
    pub(super) async fn snapshot(&self) -> HashMap<RowKey, Vec<PendingCell>> {
        let rows = self.rows.lock().await;
        rows.iter()
            .map(|(key, row)| (key.clone(), row.cells.clone()))
            .collect()
    }

    /// Clones the cells pushed since the last call, marking them persisted, so each is stored once.
    pub(super) async fn take_unpersisted(&self) -> Vec<(RowKey, Vec<PendingCell>)> {
        let mut rows = self.rows.lock().await;
        rows.iter_mut()
            .filter(|(_, row)| row.persisted < row.cells.len())
            .map(|(key, row)| {
                let cells = row.cells[row.persisted..].to_vec();
                row.persisted = row.cells.len();
                (key.clone(), cells)
            })
            .collect()
    }
}

/// Registers a fresh, empty `PendingBuffer` per DI scope — shared within one
/// sync session but reset for the next.
pub(crate) fn register_scoped_pending_buffer(injector: &mut Injector) {
    injector.register_scope_factory::<PendingBuffer>(|_scope| {
        Box::pin(async move { Arc::new(PendingBuffer::default()) })
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn take_unpersisted_after_earlier_take_returns_only_cells_pushed_since() {
        // Arrange

        let buffer = PendingBuffer::default();
        buffer.push("notes", "1", "title".into(), None).await;
        buffer.take_unpersisted().await;
        buffer.push("notes", "1", "body".into(), None).await;

        // Act

        let actual = buffer.take_unpersisted().await;

        // Assert

        let cols: Vec<(&str, Vec<&str>)> = actual
            .iter()
            .map(|(key, cells)| {
                (
                    key.row_id.as_str(),
                    cells.iter().map(|c| c.col.as_str()).collect(),
                )
            })
            .collect();
        assert_eq!(vec![("1", vec!["body"])], cols);
        assert!(buffer.take_unpersisted().await.is_empty());
    }
}
