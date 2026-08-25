use std::collections::HashMap;
use std::str::FromStr;

use sqlx::{Row, SqliteConnection};

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::{Hlc, HlcClock};
use crate::sync::utils::merge::{self, MergeAction};
use crate::sync::value_objects::granularity::Granularity;

use super::applying_guard::{clear_applying, mark_applying};
use super::column_info::{column_affinity, primary_key_columns, read_table_info};
use super::fk_repair;
use super::models::{ColumnInfo, PendingCell, RowKey};
use super::pending_buffer::PendingBuffer;
use super::trigger_sql::{parse_row_id, quote_ident};

/// Applies one page of a remote change batch. Column-mode `SetColumn` cells are
/// buffered in `pending` across pages, so a new row's columns accumulate before
/// the row is materialized. `is_last_page` triggers a final flush attempt; a row
/// still missing a `NOT NULL` column stays buffered for the next sync and
/// suppresses foreign key repair for this cycle.
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

    // Runs with the guard lifted so repairs are staged as local changes, and
    // only on the last page since an earlier "violation" may be a reference
    // whose target arrives later. Skipped while any row is unmaterialized: it is
    // absent locally, so intact references to it look dangling and the repair's
    // deletions would be pushed outward.
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

/// [`try_flush_pending`] for callers outside an [`apply_remote`] page, i.e.
/// `SyncStore::has_pending_changes`. Raises the `sync_applying` guard itself:
/// materializing a row fires the table's change-tracking triggers, which
/// unguarded would re-stage freshly pulled remote data as a local edit under
/// this device's id and clock, corrupting later merge decisions.
pub(super) async fn flush_pending_outside_page(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<bool, SyncError> {
    mark_applying(tx).await?;

    let result = try_flush_pending(&mut *tx, pending).await;

    // Must always run, but must not shadow a real flush failure.
    if let Err(err) = clear_applying(tx).await {
        if result.is_ok() {
            return Err(err);
        }
        log::error!(
            "Failed to clear sync_applying guard after flush_pending_outside_page: {err:?}"
        );
    }

    result
}

/// Best-effort flush of whatever is buffered in `pending`. Each row is upserted
/// inside its own `SAVEPOINT`: a complete row is written and dropped from the
/// buffer, an incomplete one is rolled back and stays. Returns whether any row
/// is still buffered.
///
/// Assumes the `sync_applying` guard is raised — outside an [`apply_remote`]
/// page call [`flush_pending_outside_page`] instead.
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
                pending.remove(&key.tbl, &key.row_id).await;
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

    if is_last_page && try_flush_pending(tx, pending).await? {
        log::warn!(
            "apply_remote: reached the last pulled page with one or more rows still \
             missing required columns; left them buffered for a retry on the next sync"
        );
        log_incomplete_pending_rows(tx, pending).await?;
    }

    Ok(())
}

/// Reports every row still buffered after the final flush attempt. Listing the
/// columns the local cell log holds distinguishes two causes a bare
/// `NOT NULL constraint failed` cannot: the server hasn't sent them yet (the
/// next sync fixes it), or an earlier cycle already committed past them, so they
/// will never be resent and must come from `sync_cells`.
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
            "SELECT col FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 ORDER BY col",
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
             already_in_local_sync_cells={:?} of_which_missing_are_recoverable_locally={:?}",
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
    let registry = load_registry(tx).await?;
    let mut column_cache: HashMap<String, Vec<ColumnInfo>> = HashMap::new();

    for cell in &batch.cells {
        let incoming_hlc = Hlc::parse(&cell.hlc)?;
        let granularity = *registry
            .get(&cell.tbl)
            .ok_or_else(|| SyncError::UnregisteredTable(cell.tbl.clone()))?;
        merge::validate_cell_shape(&cell.tbl, &cell.col, granularity)?;

        let won = sqlx::query(
            "INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(tbl,row_id,col) DO UPDATE SET
                value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id
             WHERE excluded.hlc > sync_cells.hlc",
        )
        .bind(&cell.tbl)
        .bind(&cell.row_id)
        .bind(&cell.col)
        .bind(cell.value.as_deref())
        .bind(&cell.hlc)
        .bind(&cell.device_id)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            > 0;

        clock.observe(&incoming_hlc);

        if !won {
            continue;
        }

        let tombstone_hlc: Option<String> = sqlx::query_scalar(
            "SELECT hlc FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3",
        )
        .bind(&cell.tbl)
        .bind(&cell.row_id)
        .bind(merge::DELETED_COL)
        .fetch_optional(&mut *tx)
        .await?;
        let tombstone_hlc = tombstone_hlc.map(|v| Hlc::parse(&v)).transpose()?;

        let action = merge::decide(
            &cell.col,
            cell.value.as_deref(),
            &incoming_hlc,
            tombstone_hlc.as_ref(),
            granularity,
        )?;

        match action {
            MergeAction::SetColumn { col, value } => {
                pending.push(&cell.tbl, &cell.row_id, col, value).await;
            }
            MergeAction::DeleteRow => {
                // A delete makes buffered column updates for this row moot.
                pending.remove(&cell.tbl, &cell.row_id).await;
                apply_action(
                    tx,
                    &cell.tbl,
                    &cell.row_id,
                    MergeAction::DeleteRow,
                    &mut column_cache,
                )
                .await?;
            }
            other => {
                apply_action(tx, &cell.tbl, &cell.row_id, other, &mut column_cache).await?;
            }
        }
    }

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

/// Writes every buffered column of one row in a single upsert, so a new row is
/// materialized at once instead of via a skeleton insert that would trip a
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

    backfill_required_columns_from_cell_log(
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

/// Fills in columns a new row's `INSERT` requires (`NOT NULL`, no `DEFAULT`)
/// but that this pull didn't deliver, reading them from `sync_cells` — the
/// durable record of every cell this device has won, where the pending buffer
/// only holds what arrived during *this* pull. A row can lose buffered columns
/// mid-cycle (a `DeleteRow` clears them, or a cell loses its HLC comparison)
/// while the cursor commits past them; the server won't resend those, so the
/// row would otherwise never be materializable again.
///
/// Only runs for a row that doesn't exist yet; an existing row already satisfies
/// its `NOT NULL` columns.
async fn backfill_required_columns_from_cell_log(
    tx: &mut SqliteConnection,
    key: &RowKey,
    pk_columns: &[&ColumnInfo],
    pk_values: &[String],
    columns: &[ColumnInfo],
    values: &mut HashMap<String, Option<Vec<u8>>>,
) -> Result<(), SyncError> {
    let missing: Vec<&str> = columns
        .iter()
        .filter(|c| c.is_required_on_insert() && !values.contains_key(&c.name))
        .map(|c| c.name.as_str())
        .collect();

    if missing.is_empty() || row_exists(tx, &key.tbl, pk_columns, pk_values).await? {
        return Ok(());
    }

    for col in missing {
        let value: Option<Option<Vec<u8>>> = sqlx::query_scalar(
            "SELECT value FROM sync_cells WHERE tbl = ?1 AND row_id = ?2 AND col = ?3",
        )
        .bind(&key.tbl)
        .bind(&key.row_id)
        .bind(col)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(value) = value {
            log::debug!(
                "backfilled required column '{col}' for {}/{} from the local cell log",
                key.tbl,
                key.row_id
            );
            values.insert(col.to_string(), value);
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

async fn load_registry(
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

async fn get_or_load_columns(
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

/// Writes one row from its non-primary-key column values as raw bytes, shared
/// by column-mode and row-mode. Each value is `CAST` to its column's affinity
/// since both callers hand over opaque bytes.
///
/// Tries `UPDATE` first, falling back to `INSERT`, rather than a single
/// `INSERT ... ON CONFLICT DO UPDATE`: SQLite evaluates the candidate insert
/// *before* resolving the conflict, so a `NOT NULL` column absent from `values`
/// would fail it even though the existing row already has it set.
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
