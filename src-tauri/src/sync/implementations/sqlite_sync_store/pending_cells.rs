use sqlx::SqliteConnection;

use super::pending_buffer::PendingBuffer;
use crate::sync::errors::SyncError;

/// Stores the cells `pending` gained in a batch in `sync_pending_cells`, the only copy of those values
/// once the batch commits and takes its cells out of the inbox. Later cells of a column win.
pub(super) async fn persist(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<(), SyncError> {
    for (key, cells) in pending.take_unpersisted().await {
        for cell in cells {
            sqlx::query(
                "INSERT INTO sync_pending_cells(tbl, row_id, col, value) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(tbl, row_id, col) DO UPDATE SET value = excluded.value",
            )
            .bind(&key.tbl)
            .bind(&key.row_id)
            .bind(&cell.col)
            .bind(cell.value)
            .execute(&mut *tx)
            .await?;
        }
    }

    Ok(())
}

/// The stored cells of a row not in its table yet, as `(col, value)`.
pub(super) async fn stored(
    tx: &mut SqliteConnection,
    tbl: &str,
    row_id: &str,
) -> Result<Vec<(String, Option<Vec<u8>>)>, SyncError> {
    Ok(
        sqlx::query_as("SELECT col, value FROM sync_pending_cells WHERE tbl = ?1 AND row_id = ?2")
            .bind(tbl)
            .bind(row_id)
            .fetch_all(&mut *tx)
            .await?,
    )
}

/// Drops a row's stored cells, once it's written to its table or deleted.
pub(super) async fn forget(
    tx: &mut SqliteConnection,
    tbl: &str,
    row_id: &str,
) -> Result<(), SyncError> {
    sqlx::query("DELETE FROM sync_pending_cells WHERE tbl = ?1 AND row_id = ?2")
        .bind(tbl)
        .bind(row_id)
        .execute(&mut *tx)
        .await?;

    Ok(())
}
