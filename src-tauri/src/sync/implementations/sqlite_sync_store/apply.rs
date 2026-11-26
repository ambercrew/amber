use std::collections::{HashMap, HashSet};
use std::str::FromStr;

use sqlx::{Row, SqliteConnection};

use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::errors::SyncError;
use crate::sync::hlc::{Hlc, HlcClock};
use crate::sync::utils::merge::{self, MergeAction};
use crate::sync::value_objects::granularity::Granularity;

use super::applying_guard::{clear_applying, mark_applying};
use super::cell_values;
use super::column_info::{column_affinity, primary_key_columns, read_table_info};
use super::fk_repair;
use super::models::{ColumnInfo, PendingCell, RowKey};
use super::pending_buffer::PendingBuffer;
use super::pending_cells;
use super::schema_gate;
use super::trigger_sql::{parse_row_id, quote_ident};

/// Applies one batch of remote cells, writing each row it completes; a column-mode row still missing a
/// `NOT NULL` column stays in `pending` (and `sync_pending_cells`), waits for its cells and holds off FK repair.
pub(super) async fn apply_remote(
    tx: &mut SqliteConnection,
    batch: ChangeBatch,
    is_last_page: bool,
    pending: &PendingBuffer,
    clock: &HlcClock,
) -> Result<(), SyncError> {
    mark_applying(tx).await?;

    let result = apply_remote_page_inner(&mut *tx, &batch, is_last_page, pending, clock).await;

    // Must always run, but must not shadow a real apply failure.
    if let Err(err) = clear_applying(tx).await {
        if result.is_ok() {
            return Err(err);
        }
        log::error!("Failed to clear sync_applying guard after apply_remote: {err:?}");
    }

    result?;

    // Repairs are staged as local changes, on the last page only (an earlier dangling reference may
    // still arrive), and never while a row is unmaterialized, as references to it would look dangling.
    if is_last_page {
        if pending.is_empty().await {
            fk_repair::repair_foreign_keys(&mut *tx).await?;
        } else {
            log::warn!(
                "Skipping foreign key repair: one or more rows are still unmaterialized, so \
                 apparent violations may just be references to a row that hasn't been \
                 assembled yet. Repair will run once the next sync completes those rows."
            );
        }
    }

    Ok(())
}

/// Flushes `pending`, each row in its own `SAVEPOINT` (complete rows are written, incomplete ones stay);
/// returns whether any is left. Needs the `sync_applying` guard.
async fn try_flush_pending(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<bool, SyncError> {
    let rows = pending.snapshot().await;
    let mut column_cache = HashMap::new();

    for (key, cells) in rows {
        let buffered_cols: Vec<String> = cells.iter().map(|c| c.col.clone()).collect();

        sqlx::query("SAVEPOINT try_flush_pending")
            .execute(&mut *tx)
            .await?;

        match apply_row_upsert_columns(tx, &key, cells, &mut column_cache).await {
            Ok(()) => {
                sqlx::query("RELEASE SAVEPOINT try_flush_pending")
                    .execute(&mut *tx)
                    .await?;
                pending.take(&key.tbl, &key.row_id).await;
                pending_cells::forget(tx, &key.tbl, &key.row_id).await?;
            }
            Err(err) => {
                log::debug!(
                    "try_flush_pending: row {}/{} not yet materializable from buffered columns \
                     {buffered_cols:?}, re-buffering: {err:?}",
                    key.tbl,
                    key.row_id
                );
                sqlx::query("ROLLBACK TO SAVEPOINT try_flush_pending")
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("RELEASE SAVEPOINT try_flush_pending")
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    Ok(!pending.is_empty().await)
}

async fn apply_remote_page_inner(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
    is_last_page: bool,
    pending: &PendingBuffer,
    clock: &HlcClock,
) -> Result<(), SyncError> {
    apply_remote_inner(tx, batch, pending, clock).await?;

    // Every batch, as each commits and takes its cells out of the inbox: a row left only in `pending` would be
    // lost if the sync stopped there. One still incomplete is stored, and rebuilt when its next cell comes.
    let incomplete = try_flush_pending(tx, pending).await?;
    pending_cells::persist(tx, pending).await?;
    if is_last_page && incomplete && discard_incomplete_deleted_rows(tx, pending).await? {
        log::warn!(
            "apply_remote: reached the last pulled page with one or more rows still \
             missing required columns; left them buffered for a retry on the next sync"
        );
        log_incomplete_pending_rows(tx, pending).await?;
    }

    Ok(())
}

/// SQL for whether the row keyed `{key}` was deleted: it has a tombstone and isn't in the table. A row
/// that came back keeps its tombstone, as only a refused delete's restage forgets one. Binds `?1`, `?3`.
async fn deleted_predicate(
    tx: &mut SqliteConnection,
    table: &str,
    key: &str,
) -> Result<String, SyncError> {
    let columns = read_table_info(tx, table).await?;
    let key_columns = primary_key_columns(table, &columns)?;
    let [key_column] = key_columns.as_slice() else {
        return Err(SyncError::InvalidPrimaryKey {
            table: table.to_string(),
            details: "a deletion lookup needs a single-column primary key".to_string(),
        });
    };
    Ok(format!(
        "EXISTS (SELECT 1 FROM sync_cells WHERE tbl = ?1 AND row_id = json_array({key}) AND col = ?3) \
         AND NOT EXISTS (SELECT 1 FROM {} WHERE {} = {key})",
        quote_ident(table),
        quote_ident(&key_column.name),
    ))
}

/// Whether a single-column-key row was deleted; tombstones are kept for good, so this outlives the row.
pub(super) async fn is_row_deleted(
    tx: &mut SqliteConnection,
    table: &str,
    primary_key: &str,
) -> Result<bool, SyncError> {
    let sql = format!("SELECT {}", deleted_predicate(tx, table, "?2").await?);
    Ok(sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(table)
        .bind(primary_key)
        .bind(merge::DELETED_COL)
        .fetch_one(tx)
        .await?)
}

/// One probe of the primary key index per key, bound as a single JSON array.
pub(super) async fn deleted_rows(
    tx: &mut SqliteConnection,
    table: &str,
    primary_keys: &[String],
) -> Result<HashSet<String>, SyncError> {
    let keys = serde_json::to_string(primary_keys).expect("a list of strings always serializes");
    let predicate = deleted_predicate(tx, table, "keys.value").await?;
    let sql = format!("SELECT keys.value FROM json_each(?2) AS keys WHERE {predicate}");
    let rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(table)
        .bind(keys)
        .bind(merge::DELETED_COL)
        .fetch_all(tx)
        .await?;
    Ok(rows.into_iter().collect())
}

/// Unbuffers incomplete deleted rows, whose missing cells were deleted with them and
/// would otherwise hold off FK repair. Returns whether any row is still buffered.
async fn discard_incomplete_deleted_rows(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<bool, SyncError> {
    for key in pending.snapshot().await.into_keys() {
        let is_deleted: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3)",
        )
        .bind(&key.tbl)
        .bind(&key.row_id)
        .bind(merge::DELETED_COL)
        .fetch_one(&mut *tx)
        .await?;

        if is_deleted {
            log::info!(
                "Discarding buffered columns for deleted row {}/{}: they can't complete it",
                key.tbl,
                key.row_id
            );
            // Stays stored, as a re-insert split across syncs completes it.
            pending.take(&key.tbl, &key.row_id).await;
        }
    }

    Ok(!pending.is_empty().await)
}

/// Logs every row still buffered after the last flush, with the columns stored for it, to tell
/// "not sent yet" (next sync fixes it) from "committed past" (must come from `sync_pending_cells`).
async fn log_incomplete_pending_rows(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<(), SyncError> {
    let mut column_cache = HashMap::new();

    for (key, cells) in pending.snapshot().await {
        let mut arrived: Vec<&str> = cells.iter().map(|c| c.col.as_str()).collect();
        arrived.sort_unstable();

        let columns = get_or_load_columns(tx, &key.tbl, &mut column_cache).await?;
        let missing: Vec<&str> = columns
            .iter()
            .filter(|c| c.is_required_on_insert() && !arrived.contains(&c.name.as_str()))
            .map(|c| c.name.as_str())
            .collect();

        let known_locally: Vec<String> = sqlx::query_scalar(
            "SELECT col FROM sync_pending_cells WHERE tbl = ?1 AND row_id = ?2 ORDER BY col",
        )
        .bind(&key.tbl)
        .bind(&key.row_id)
        .fetch_all(&mut *tx)
        .await?;

        let recoverable_from_cell_log: Vec<&&str> = missing
            .iter()
            .filter(|col| known_locally.iter().any(|known| known == *col))
            .collect();

        log::warn!(
            "sync-incomplete-row: tbl={} row_id={} arrived_this_pull={:?} missing_required={:?} \
             already_stored={:?} of_which_missing_are_recoverable_locally={:?}",
            key.tbl,
            key.row_id,
            arrived,
            missing,
            known_locally,
            recoverable_from_cell_log,
        );
    }

    Ok(())
}

async fn apply_remote_inner(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
    pending: &PendingBuffer,
    clock: &HlcClock,
) -> Result<(), SyncError> {
    schema_gate::ensure_schema_supported(tx, batch).await?;

    let registry = load_registry(tx).await?;
    let delete_guards = load_delete_guards(tx).await?;
    let mut column_cache: HashMap<String, Vec<ColumnInfo>> = HashMap::new();
    let mut guarded_deletes: Vec<(&CellChange, Granularity)> = Vec::new();

    for cell in &batch.cells {
        let incoming_hlc = Hlc::parse(&cell.hlc)?;
        let granularity = *registry
            .get(&cell.tbl)
            .ok_or_else(|| SyncError::UnregisteredTable(cell.tbl.clone()))?;
        merge::validate_cell_shape(&cell.tbl, &cell.col, granularity)?;

        let won = sqlx::query(
            "INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES (?1,?2,?3,?4,1)
             ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=1
             WHERE excluded.hlc > sync_cells.hlc",
        )
        .bind(&cell.tbl)
        .bind(&cell.row_id)
        .bind(&cell.col)
        .bind(incoming_hlc.to_bytes())
        .execute(&mut *tx)
        .await?
        .rows_affected()
            > 0;

        clock.observe(&incoming_hlc);

        if !won
            && !is_unmaterialized_cell(tx, cell, &incoming_hlc, granularity, &mut column_cache)
                .await?
        {
            continue;
        }

        let tombstone_hlc: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT hlc FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3",
        )
        .bind(&cell.tbl)
        .bind(&cell.row_id)
        .bind(merge::DELETED_COL)
        .fetch_optional(&mut *tx)
        .await?;
        let tombstone_hlc = tombstone_hlc.map(|v| Hlc::from_bytes(&v)).transpose()?;

        let action = merge::decide(
            &cell.col,
            cell.value.as_deref(),
            &incoming_hlc,
            tombstone_hlc.as_ref(),
            granularity,
        )?;

        match action {
            MergeAction::Discard => {
                // Older than the row's tombstone, so it must not linger in the cell log.
                drop_cell(tx, &cell.tbl, &cell.row_id, &cell.col).await?;
            }
            MergeAction::SetColumn { col, value } => {
                pending.push(&cell.tbl, &cell.row_id, col, value).await;
            }
            MergeAction::DeleteRow if delete_guards.contains_key(&cell.tbl) => {
                // The guard reads other tables, so it waits for the rest of the page.
                guarded_deletes.push((cell, granularity));
            }
            MergeAction::DeleteRow => {
                delete_row(tx, cell, granularity, pending, &mut column_cache).await?;
            }
            other => {
                apply_action(tx, &cell.tbl, &cell.row_id, other, &mut column_cache).await?;
            }
        }
    }

    if guarded_deletes.is_empty() {
        return Ok(());
    }
    try_flush_pending(tx, pending).await?;
    for (cell, granularity) in guarded_deletes {
        if !is_latest_tombstone(tx, cell).await? {
            continue;
        }
        if is_delete_refused(
            tx,
            &cell.tbl,
            &cell.row_id,
            delete_guards.get(&cell.tbl),
            &mut column_cache,
        )
        .await?
        {
            restage_row(tx, &cell.tbl, &cell.row_id, &mut column_cache).await?;
        } else {
            delete_row(tx, cell, granularity, pending, &mut column_cache).await?;
        }
    }
    // Materializes rows that newer cells resurrected after their guarded delete.
    try_flush_pending(tx, pending).await?;

    Ok(())
}

/// Whether `cell` was stored by an earlier cycle that couldn't materialize its row.
/// Skipping it would leave `pending` empty, and FK repair would discard the row's children.
async fn is_unmaterialized_cell(
    tx: &mut SqliteConnection,
    cell: &CellChange,
    hlc: &Hlc,
    granularity: Granularity,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<bool, SyncError> {
    if !matches!(granularity, Granularity::Column) || cell.col == merge::DELETED_COL {
        return Ok(false);
    }

    let stored_hlc: Option<Vec<u8>> = sqlx::query_scalar(
        "SELECT hlc FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3",
    )
    .bind(&cell.tbl)
    .bind(&cell.row_id)
    .bind(&cell.col)
    .fetch_optional(&mut *tx)
    .await?;
    if stored_hlc != Some(hlc.to_bytes()) {
        return Ok(false);
    }

    let columns = get_or_load_columns(tx, &cell.tbl, column_cache).await?;
    let pk_columns = primary_key_columns(&cell.tbl, &columns)?;
    let pk_values = parse_row_id(&cell.tbl, &cell.row_id, pk_columns.len())?;

    Ok(!row_exists(tx, &cell.tbl, &pk_columns, &pk_values).await?)
}

async fn delete_row(
    tx: &mut SqliteConnection,
    cell: &CellChange,
    granularity: Granularity,
    pending: &PendingBuffer,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    let tombstone_hlc = Hlc::parse(&cell.hlc)?.to_bytes();
    // A delete makes buffered column updates moot, except those newer than it, replayed below.
    let buffered = pending.take(&cell.tbl, &cell.row_id).await;
    drop_cells_older_than(tx, &cell.tbl, &cell.row_id, &tombstone_hlc).await?;

    let newer: Vec<String> = sqlx::query_scalar(
        "SELECT col FROM sync_cells
         WHERE tbl = ?1 AND row_id = ?2 AND col <> ?3 AND hlc > ?4
         ORDER BY hlc",
    )
    .bind(&cell.tbl)
    .bind(&cell.row_id)
    .bind(merge::DELETED_COL)
    .bind(&tombstone_hlc)
    .fetch_all(&mut *tx)
    .await?;
    // Read before the delete, from the row; a buffered value is newer than the row's.
    let keys: Vec<cell_values::CellKey> = newer
        .iter()
        .map(|col| (cell.row_id.clone(), col.clone()))
        .collect();
    let mut values = if keys.is_empty() {
        HashMap::new()
    } else {
        cell_values::read(tx, &cell.tbl, granularity, &keys).await?
    };
    for buffered_cell in buffered {
        let key = (cell.row_id.clone(), buffered_cell.col);
        if newer.contains(&key.1) {
            values.insert(key, buffered_cell.value);
        }
    }
    pending_cells::forget(tx, &cell.tbl, &cell.row_id).await?;

    apply_action(
        tx,
        &cell.tbl,
        &cell.row_id,
        MergeAction::DeleteRow,
        column_cache,
    )
    .await?;
    replay_cells_newer_than(tx, cell, granularity, newer, values, pending, column_cache).await
}

/// Re-applies the row's cells that outrank its tombstone, so a delete applied after
/// them (out of order, or deferred by a guard) still ends with them resurrecting the row.
async fn replay_cells_newer_than(
    tx: &mut SqliteConnection,
    tombstone: &CellChange,
    granularity: Granularity,
    newer: Vec<String>,
    mut values: HashMap<cell_values::CellKey, Option<Vec<u8>>>,
    pending: &PendingBuffer,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    for col in newer {
        let Some(value) = values.remove(&(tombstone.row_id.clone(), col.clone())) else {
            log::warn!(
                "Can't replay {}/{}.{col} over its tombstone: its value is gone",
                tombstone.tbl,
                tombstone.row_id
            );
            continue;
        };
        match granularity {
            Granularity::Column => {
                pending
                    .push(&tombstone.tbl, &tombstone.row_id, col, value)
                    .await;
            }
            Granularity::Row => {
                let value = value.ok_or_else(|| SyncError::InvalidRowPayload {
                    table: tombstone.tbl.clone(),
                    reason: "row-mode '__row' cell had a NULL value".to_string(),
                })?;
                apply_action(
                    tx,
                    &tombstone.tbl,
                    &tombstone.row_id,
                    MergeAction::UpsertRow { value },
                    column_cache,
                )
                .await?;
            }
        }
    }

    Ok(())
}

/// Whether `cell` is still the row's tombstone, i.e. no later cell in its page replaced it.
async fn is_latest_tombstone(
    tx: &mut SqliteConnection,
    cell: &CellChange,
) -> Result<bool, SyncError> {
    let hlc: Option<Vec<u8>> = sqlx::query_scalar(
        "SELECT hlc FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3",
    )
    .bind(&cell.tbl)
    .bind(&cell.row_id)
    .bind(merge::DELETED_COL)
    .fetch_optional(&mut *tx)
    .await?;
    Ok(hlc == Some(Hlc::parse(&cell.hlc)?.to_bytes()))
}

/// Whether `table`'s delete guard holds for this existing row, i.e. the remote
/// delete must be refused. A row absent locally has nothing to keep.
async fn is_delete_refused(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    guard: Option<&String>,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<bool, SyncError> {
    let Some(guard) = guard else {
        return Ok(false);
    };
    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = primary_key_columns(table, &columns)?;
    let pk_values = parse_row_id(table, row_id, pk_columns.len())?;
    if !row_exists(tx, table, &pk_columns, &pk_values).await? {
        return Ok(false);
    }

    let mut query = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT ({guard})")));
    for value in &pk_values {
        query = query.bind(value);
    }
    Ok(query.fetch_one(&mut *tx).await?)
}

/// Resurrects a refused-delete row: forgets the tombstone and re-stages every cell
/// via its `au` trigger, under an HLC that outranks the tombstone everywhere.
async fn restage_row(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    drop_cell(tx, table, row_id, merge::DELETED_COL).await?;

    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = primary_key_columns(table, &columns)?;
    let pk_values = parse_row_id(table, row_id, pk_columns.len())?;
    let pk_predicate: String = pk_columns
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{} = ?{}", quote_ident(&c.name), i + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    let touch_col = quote_ident(&pk_columns[0].name);
    let sql = format!(
        "UPDATE {} SET {touch_col} = {touch_col} WHERE {pk_predicate}",
        quote_ident(table)
    );

    // The triggers only stage local changes, so lift the applying guard meanwhile.
    clear_applying(tx).await?;
    sqlx::query("INSERT INTO sync_backfilling(x) VALUES (1)")
        .execute(&mut *tx)
        .await?;
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for value in &pk_values {
        query = query.bind(value);
    }
    query.execute(&mut *tx).await?;
    sqlx::query("DELETE FROM sync_backfilling")
        .execute(&mut *tx)
        .await?;
    mark_applying(tx).await
}

/// Drops a row's cells older than its new tombstone `hlc`, mirroring what the
/// delete trigger does for a local delete. Newer cells may still resurrect it.
async fn drop_cells_older_than(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    hlc: &[u8],
) -> Result<(), SyncError> {
    sqlx::query("DELETE FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col <> ?3 AND hlc < ?4")
        .bind(table)
        .bind(row_id)
        .bind(merge::DELETED_COL)
        .bind(hlc)
        .execute(&mut *tx)
        .await?;

    Ok(())
}

pub(super) async fn drop_cell(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    col: &str,
) -> Result<(), SyncError> {
    sqlx::query("DELETE FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3")
        .bind(table)
        .bind(row_id)
        .bind(col)
        .execute(&mut *tx)
        .await?;

    Ok(())
}

async fn apply_action(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    action: MergeAction,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = primary_key_columns(table, &columns)?;
    let pk_values = parse_row_id(table, row_id, pk_columns.len())?;
    match action {
        MergeAction::Discard => Ok(()),
        MergeAction::DeleteRow => {
            let where_clause: String = pk_columns
                .iter()
                .enumerate()
                .map(|(i, c)| format!("{} = ?{}", quote_ident(&c.name), i + 1))
                .collect::<Vec<_>>()
                .join(" AND ");
            let sql = format!("DELETE FROM {} WHERE {}", quote_ident(table), where_clause);
            let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
            for value in &pk_values {
                query = query.bind(value);
            }
            query.execute(&mut *tx).await?;

            Ok(())
        }
        MergeAction::SetColumn { .. } => {
            unreachable!(
                "SetColumn is routed into the pending buffer by apply_remote_inner and \
                 materialized via apply_row_upsert_columns, never passed to apply_action"
            )
        }
        MergeAction::UpsertRow { value } => {
            apply_row_upsert(tx, table, &pk_columns, &pk_values, &columns, &value).await
        }
    }
}

/// Writes every buffered column of one row in a single upsert, as a skeleton insert would trip a
/// `NOT NULL` column with no `DEFAULT`.
async fn apply_row_upsert_columns(
    tx: &mut SqliteConnection,
    key: &RowKey,
    cells: Vec<PendingCell>,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    if cells.is_empty() {
        return Ok(());
    }

    let table = key.tbl.as_str();

    // Later cells for the same column win.
    let mut values: HashMap<String, Option<Vec<u8>>> = HashMap::new();
    for cell in cells {
        values.insert(cell.col, cell.value);
    }

    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = primary_key_columns(table, &columns)?;
    let pk_values = parse_row_id(table, &key.row_id, pk_columns.len())?;

    // A newer app version may sync columns this one lacks; row mode ignores them too.
    values.retain(|col, _| columns.iter().any(|c| &c.name == col));

    backfill_missing_columns_from_stored_cells(
        tx,
        key,
        &pk_columns,
        &pk_values,
        &columns,
        &mut values,
    )
    .await?;

    upsert_row(tx, table, &pk_columns, &pk_values, &columns, values).await
}

/// Fills a new row's columns this pull didn't deliver from `sync_pending_cells`: a row loses buffered columns
/// when a batch or sync committed past them, and the server won't resend those.
async fn backfill_missing_columns_from_stored_cells(
    tx: &mut SqliteConnection,
    key: &RowKey,
    pk_columns: &[&ColumnInfo],
    pk_values: &[String],
    columns: &[ColumnInfo],
    values: &mut HashMap<String, Option<Vec<u8>>>,
) -> Result<(), SyncError> {
    let missing: HashSet<&str> = columns
        .iter()
        .filter(|c| !c.is_primary_key() && !values.contains_key(&c.name))
        .map(|c| c.name.as_str())
        .collect();
    if missing.is_empty() || row_exists(tx, &key.tbl, pk_columns, pk_values).await? {
        return Ok(());
    }

    for (col, value) in pending_cells::stored(tx, &key.tbl, &key.row_id).await? {
        if missing.contains(col.as_str()) {
            log::debug!(
                "backfilled column '{col}' for {}/{} from its stored cells",
                key.tbl,
                key.row_id
            );
            values.insert(col, value);
        }
    }

    Ok(())
}

async fn row_exists(
    tx: &mut SqliteConnection,
    table: &str,
    pk_columns: &[&ColumnInfo],
    pk_values: &[String],
) -> Result<bool, SyncError> {
    let pk_predicate: String = pk_columns
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{} = ?{}", quote_ident(&c.name), i + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!(
        "SELECT EXISTS(SELECT 1 FROM {} WHERE {pk_predicate})",
        quote_ident(table)
    );

    let mut query = sqlx::query_scalar(sqlx::AssertSqlSafe(sql));
    for value in pk_values {
        query = query.bind(value);
    }

    Ok(query.fetch_one(&mut *tx).await?)
}

async fn apply_row_upsert(
    tx: &mut SqliteConnection,
    table: &str,
    pk_columns: &[&ColumnInfo],
    pk_values: &[String],
    columns: &[ColumnInfo],
    value: &[u8],
) -> Result<(), SyncError> {
    let text = std::str::from_utf8(value).map_err(|_| SyncError::InvalidRowPayload {
        table: table.to_string(),
        reason: "payload was not valid UTF-8".to_string(),
    })?;
    let json: serde_json::Value =
        serde_json::from_str(text).map_err(|err| SyncError::InvalidRowPayload {
            table: table.to_string(),
            reason: err.to_string(),
        })?;
    let obj = json
        .as_object()
        .ok_or_else(|| SyncError::InvalidRowPayload {
            table: table.to_string(),
            reason: "payload was not a JSON object".to_string(),
        })?;

    // The primary key comes from `row_id`, which the merge conflict was
    // resolved against, not from the payload.
    let mut values: HashMap<String, Option<Vec<u8>>> = HashMap::new();
    for (key, json_value) in obj {
        if pk_columns.iter().any(|c| &c.name == key) {
            continue;
        }
        if columns.iter().any(|c| &c.name == key) {
            values.insert(key.clone(), json_scalar_to_bytes(table, json_value)?);
        }
    }

    upsert_row(tx, table, pk_columns, pk_values, columns, values).await
}

pub(super) async fn load_registry(
    tx: &mut SqliteConnection,
) -> Result<HashMap<String, Granularity>, SyncError> {
    let rows = sqlx::query("SELECT tbl, granularity FROM sync_registry")
        .fetch_all(&mut *tx)
        .await?;

    let mut registry = HashMap::with_capacity(rows.len());
    for row in rows {
        let tbl: String = row.try_get("tbl")?;
        let granularity: String = row.try_get("granularity")?;
        registry.insert(tbl, Granularity::from_str(&granularity)?);
    }

    Ok(registry)
}

async fn load_delete_guards(
    tx: &mut SqliteConnection,
) -> Result<HashMap<String, String>, SyncError> {
    let rows = sqlx::query("SELECT tbl, condition FROM sync_delete_guards")
        .fetch_all(&mut *tx)
        .await?;

    let mut guards = HashMap::with_capacity(rows.len());
    for row in rows {
        guards.insert(row.try_get("tbl")?, row.try_get("condition")?);
    }

    Ok(guards)
}

pub(super) async fn get_or_load_columns(
    tx: &mut SqliteConnection,
    table: &str,
    cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<Vec<ColumnInfo>, SyncError> {
    if let Some(columns) = cache.get(table) {
        return Ok(columns.clone());
    }

    let columns = read_table_info(tx, table).await?;
    if columns.is_empty() {
        return Err(SyncError::TableNotFound(table.to_string()));
    }

    cache.insert(table.to_string(), columns.clone());
    Ok(columns)
}

/// Writes one row from raw column bytes, each `CAST` to its column's affinity. `UPDATE` then `INSERT`,
/// not `ON CONFLICT DO UPDATE`, which checks `NOT NULL` on the candidate insert before the conflict.
async fn upsert_row(
    tx: &mut SqliteConnection,
    table: &str,
    pk_columns: &[&ColumnInfo],
    pk_values: &[String],
    columns: &[ColumnInfo],
    values: HashMap<String, Option<Vec<u8>>>,
) -> Result<(), SyncError> {
    let mut cols: Vec<String> = values.keys().cloned().collect();
    cols.sort();

    // `CAST(?{idx} AS <affinity>)`, or a bare placeholder for `BLOB` affinity.
    let cast_expr = |col: &str, idx: usize| -> Result<String, SyncError> {
        let column_info =
            columns
                .iter()
                .find(|c| c.name == col)
                .ok_or_else(|| SyncError::UnknownColumn {
                    table: table.to_string(),
                    col: col.to_string(),
                })?;
        let affinity = column_affinity(&column_info.col_type);
        Ok(if affinity == "BLOB" {
            format!("?{idx}")
        } else {
            format!("CAST(?{idx} AS {affinity})")
        })
    };

    let pk_idents: Vec<String> = pk_columns.iter().map(|c| quote_ident(&c.name)).collect();

    if !cols.is_empty() {
        let mut set_clauses = Vec::with_capacity(cols.len());
        for (i, col) in cols.iter().enumerate() {
            set_clauses.push(format!("{} = {}", quote_ident(col), cast_expr(col, i + 1)?));
        }
        let pk_predicate: String = pk_idents
            .iter()
            .enumerate()
            .map(|(i, ident)| format!("{ident} = ?{}", cols.len() + i + 1))
            .collect::<Vec<_>>()
            .join(" AND ");

        let update_sql = format!(
            "UPDATE {} SET {} WHERE {pk_predicate}",
            quote_ident(table),
            set_clauses.join(","),
        );

        let mut query = sqlx::query(sqlx::AssertSqlSafe(update_sql));
        for col in &cols {
            query = query.bind(values.get(col).cloned().flatten());
        }
        for value in pk_values {
            query = query.bind(value);
        }

        if query.execute(&mut *tx).await?.rows_affected() > 0 {
            return Ok(());
        }
    } else if row_exists(tx, table, pk_columns, pk_values).await? {
        return Ok(());
    }

    // Genuinely new row: a missing required column correctly errors here.
    let pk_placeholders: Vec<String> = (1..=pk_values.len()).map(|i| format!("?{i}")).collect();
    let col_idents: Vec<String> = cols.iter().map(|c| quote_ident(c)).collect();
    let col_exprs: Vec<String> = cols
        .iter()
        .enumerate()
        .map(|(i, col)| cast_expr(col, pk_values.len() + i + 1))
        .collect::<Result<_, _>>()?;

    let insert_sql = if cols.is_empty() {
        format!(
            "INSERT INTO {}({}) VALUES ({})",
            quote_ident(table),
            pk_idents.join(","),
            pk_placeholders.join(",")
        )
    } else {
        format!(
            "INSERT INTO {}({},{}) VALUES ({},{})",
            quote_ident(table),
            pk_idents.join(","),
            col_idents.join(","),
            pk_placeholders.join(","),
            col_exprs.join(",")
        )
    };

    let mut query = sqlx::query(sqlx::AssertSqlSafe(insert_sql));
    for value in pk_values {
        query = query.bind(value);
    }
    for col in &cols {
        query = query.bind(values.get(col).cloned().flatten());
    }
    query.execute(&mut *tx).await?;

    Ok(())
}

/// Converts a JSON scalar from a row-mode payload into the raw bytes
/// column-mode cells carry, so both paths share `upsert_row`.
fn json_scalar_to_bytes(
    table: &str,
    value: &serde_json::Value,
) -> Result<Option<Vec<u8>>, SyncError> {
    match value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Bool(b) => Ok(Some(if *b { b"1".to_vec() } else { b"0".to_vec() })),
        serde_json::Value::Number(n) => Ok(Some(n.to_string().into_bytes())),
        serde_json::Value::String(s) => Ok(Some(s.clone().into_bytes())),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            Err(SyncError::InvalidRowPayload {
                table: table.to_string(),
                reason: "nested JSON values are not supported".to_string(),
            })
        }
    }
}
