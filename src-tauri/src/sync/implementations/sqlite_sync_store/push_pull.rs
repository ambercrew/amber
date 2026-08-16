use sqlx::{Row, SqliteConnection};

use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::sql_functions;

const LAST_PUSHED_HLC_CONFIG: &str = "sync_last_pushed_hlc";
const LAST_PULLED_SERVER_SEQ_CONFIG: &str = "sync_last_pulled_server_seq";

pub(super) async fn changes_since_last_push(
    tx: &mut SqliteConnection,
) -> Result<ChangeBatch, SyncError> {
    let last_pushed_hlc: String =
        sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
            .bind(LAST_PUSHED_HLC_CONFIG)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or_default();

    let device_id = sql_functions::device_id();

    let rows = sqlx::query(
        "SELECT tbl, row_id, col, value, hlc, device_id FROM sync_cells
         WHERE device_id = ?1 AND hlc > ?2
         ORDER BY hlc",
    )
    .bind(device_id.to_string())
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
