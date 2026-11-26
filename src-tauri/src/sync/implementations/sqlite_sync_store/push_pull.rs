use std::collections::HashMap;

use sqlx::SqliteConnection;

use super::apply::{drop_cell, get_or_load_columns, load_registry};
use super::cell_values::{self, CellKey};
use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::utils::merge;
use crate::sync::value_objects::granularity::Granularity;

const LAST_PUSHED_HLC_CONFIG: &str = "sync_last_pushed_hlc";
const LAST_PULLED_SERVER_SEQ_CONFIG: &str = "sync_last_pulled_server_seq";

/// The cells this device wrote and hasn't pushed, with their values read from their rows. A cell whose
/// row (a cascade during an apply) or column is gone and left no value to push is dropped, as it never will.
pub(super) async fn changes_since_last_push(
    tx: &mut SqliteConnection,
) -> Result<ChangeBatch, SyncError> {
    let last_pushed_hlc: Option<String> =
        sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
            .bind(LAST_PUSHED_HLC_CONFIG)
            .fetch_optional(&mut *tx)
            .await?;
    // An empty blob sorts before every HLC.
    let last_pushed_hlc = match last_pushed_hlc.as_deref() {
        Some(text) if !text.is_empty() => Hlc::parse(text)?.to_bytes(),
        _ => Vec::new(),
    };

    let rows: Vec<(String, String, String, Vec<u8>)> = sqlx::query_as(
        "SELECT tbl, row_id, col, hlc FROM sync_cells
         WHERE is_remote = 0 AND hlc > ?1
         ORDER BY hlc",
    )
    .bind(last_pushed_hlc)
    .fetch_all(&mut *tx)
    .await?;

    let registry = load_registry(tx).await?;
    let mut cells_by_table: HashMap<&str, Vec<CellKey>> = HashMap::new();
    // A tombstone has no value to read, so only valued cells need their table registered.
    for (tbl, row_id, col, _) in rows
        .iter()
        .filter(|(_, _, col, _)| col != merge::DELETED_COL)
    {
        cells_by_table
            .entry(tbl)
            .or_default()
            .push((row_id.clone(), col.clone()));
    }
    let mut values: HashMap<&str, HashMap<CellKey, Option<Vec<u8>>>> = HashMap::new();
    for (tbl, cells) in cells_by_table {
        // Failing, as skipping would move the push cursor past these cells for good.
        let Some(granularity) = registry.get(tbl) else {
            return Err(SyncError::UnregisteredTable(tbl.to_string()));
        };
        values.insert(tbl, cell_values::read(tx, tbl, *granularity, &cells).await?);
    }

    let mut column_cache = HashMap::new();
    let mut cells = Vec::with_capacity(rows.len());
    for (tbl, row_id, col, hlc) in &rows {
        let value = if col == merge::DELETED_COL {
            None
        } else {
            let key = (row_id.clone(), col.clone());
            match values.get(tbl.as_str()).and_then(|v| v.get(&key)) {
                Some(value) => value.clone(),
                None => {
                    // A found row yields every column it has, so only a column-mode cell can outlive its column.
                    let columns = get_or_load_columns(tx, tbl, &mut column_cache).await?;
                    let column_exists = registry[tbl.as_str()] == Granularity::Row
                        || columns
                            .iter()
                            .any(|c| &c.name == col && !c.is_primary_key());
                    let gone = if column_exists { "row" } else { "column" };
                    log::warn!("Not pushing {tbl}/{row_id}.{col}: its {gone} is gone");
                    drop_cell(tx, tbl, row_id, col).await?;
                    continue;
                }
            }
        };
        let hlc = Hlc::from_bytes(hlc)?;
        cells.push(CellChange {
            tbl: tbl.clone(),
            row_id: row_id.clone(),
            col: col.clone(),
            value,
            device_id: hlc.device_id.to_string(),
            hlc: hlc.format(),
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
