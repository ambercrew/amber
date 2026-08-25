use sqlx::{Row, SqliteConnection};

use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;

const LAST_PUSHED_HLC_CONFIG: &str = "sync_last_pushed_hlc";
const LAST_PULLED_SERVER_SEQ_CONFIG: &str = "sync_last_pulled_server_seq";

/// The cells this device wrote and hasn't pushed yet. Matches on the same
/// `device_id()` SQL function the change-tracking triggers stamp cells with, so
/// both sides resolve to the clock registered on this very connection (see
/// `register_sync_sql_functions`) rather than to two ids that could drift apart.
pub(super) async fn changes_since_last_push(
    tx: &mut SqliteConnection,
) -> Result<ChangeBatch, SyncError> {
    let last_pushed_hlc: String =
        sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
            .bind(LAST_PUSHED_HLC_CONFIG)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or_default();

    let rows = sqlx::query(
        "SELECT tbl, row_id, col, value, hlc, device_id FROM sync_cells
         WHERE sync_cells.device_id = device_id() AND hlc > ?1
         ORDER BY hlc",
    )
    .bind(&last_pushed_hlc)
    .fetch_all(&mut *tx)
    .await?;

    let mut cells = Vec::with_capacity(rows.len());
    for row in rows {
        cells.push(CellChange {
            tbl: row.try_get("tbl")?,
            row_id: row.try_get("row_id")?,
            col: row.try_get("col")?,
            value: row.try_get("value")?,
            hlc: row.try_get("hlc")?,
            device_id: row.try_get("device_id")?,
        });
    }

    Ok(ChangeBatch { cells })
}

pub(super) async fn mark_pushed(
    tx: &mut SqliteConnection,
    up_to_hlc: &Hlc,
) -> Result<(), SyncError> {
    sqlx::query(
        "INSERT INTO local_configurations(name, value) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value",
    )
    .bind(LAST_PUSHED_HLC_CONFIG)
    .bind(up_to_hlc.format())
    .execute(&mut *tx)
    .await?;

    Ok(())
}

pub(super) async fn get_last_pulled_server_seq(
    tx: &mut SqliteConnection,
) -> Result<Option<i64>, SyncError> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
            .bind(LAST_PULLED_SERVER_SEQ_CONFIG)
            .fetch_optional(&mut *tx)
            .await?;

    Ok(value.and_then(|v| v.parse::<i64>().ok()))
}

pub(super) async fn set_last_pulled_server_seq(
    tx: &mut SqliteConnection,
    seq: i64,
) -> Result<(), SyncError> {
    // There is no fallback to a full re-pull if the cursor falls behind the
    // server's retained history, so log a large jump to make a mid-gap resume
    // (after backend history compaction) visible.
    if let Some(previous) = get_last_pulled_server_seq(tx).await?
        && seq - previous > 100_000
    {
        log::warn!(
            "Sync cursor is jumping from server seq {previous} to {seq} — if the backend has \
             compacted history older than this device's cursor, this could resume mid-gap \
             with no local fallback to a full re-sync."
        );
    }

    sqlx::query(
        "INSERT INTO local_configurations(name, value) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value",
    )
    .bind(LAST_PULLED_SERVER_SEQ_CONFIG)
    .bind(seq.to_string())
    .execute(&mut *tx)
    .await?;

    Ok(())
}
