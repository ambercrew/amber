use std::collections::HashMap;
use std::str::FromStr;

use sqlx::{Row, SqliteConnection};

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::sql_functions;
use crate::sync::utils::merge::{self, MergeAction};
use crate::sync::value_objects::granularity::Granularity;

use super::applying_guard::{clear_applying, mark_applying};
use super::column_info::{column_affinity, primary_key_columns, read_table_info};
use super::fk_repair;
use super::models::{ColumnInfo, PendingCell, RowKey};
use super::pending_buffer::PendingBuffer;
use super::trigger_sql::{parse_row_id, quote_ident};

/// Applies one page of a remote change batch. Column-mode `SetColumn` cells
/// are buffered in `pending` (kept across pages) instead of written
/// immediately, so a new row's columns — which pagination can split across
/// pages — accumulate before the row is materialized. Pass `is_last_page =
/// true` on a single-page call, or on the final page of a multi-page pull to
/// flush what remains buffered; a row still missing a `NOT NULL` column at
/// that point surfaces as a constraint error from the flush itself.
pub(super) async fn apply_remote(
    tx: &mut SqliteConnection,
    batch: ChangeBatch,
    is_last_page: bool,
    pending: &PendingBuffer,
) -> Result<(), SyncError> {
    mark_applying(tx).await?;

    let result = apply_remote_page_inner(&mut *tx, &batch, is_last_page, pending).await;

    // Must always run, but its own error must never shadow a real
    // `apply_remote_page_inner` failure with a misleading cleanup error.
    if let Err(err) = clear_applying(tx).await {
        if result.is_ok() {
            return Err(err);
        }
        log::error!("Failed to clear sync_applying guard after apply_remote: {err:?}");
    }

    result?;

    // Runs with the sync_applying guard lifted so repairs are recorded as
    // local changes and pushed. Deferred to the last page since an earlier
    // "violation" may just be a reference whose target arrives later.
    if is_last_page {
        fk_repair::repair_foreign_keys(&mut *tx).await?;
    }

    Ok(())
}

/// Best-effort flush of whatever is buffered in `pending`, without waiting
/// for the last page. Each row is upserted inside its own `SAVEPOINT`: one
/// whose required columns have all arrived is written and removed from the
/// buffer, while one still missing a column is rolled back and stays
/// buffered. Returns whether any row is still buffered afterwards.
pub(super) async fn try_flush_pending(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<bool, SyncError> {
    let rows = pending.snapshot().await;
    let mut column_cache = HashMap::new();

    for (key, cells) in rows {
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
                    "try_flush_pending: row {}/{} not yet materializable, re-buffering: {err:?}",
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
) -> Result<(), SyncError> {
    apply_remote_inner(tx, batch, pending).await?;

    if is_last_page {
        let mut column_cache = HashMap::new();
        flush_pending(tx, pending, &mut column_cache).await?;
    }

    Ok(())
}

async fn apply_remote_inner(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
    pending: &PendingBuffer,
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

        sql_functions::sync_clock().observe(&incoming_hlc);

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
                // A delete makes any buffered-but-not-yet-materialized column
                // update for this row moot; drop it instead of trying to
                // upsert a row that's about to be deleted anyway.
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

/// Flushes every row currently buffered in `pending` as a single upsert per
/// row, then clears the buffer.
async fn flush_pending(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    let rows = pending.take_all().await;
    for (key, cells) in rows {
        apply_row_upsert_columns(tx, &key, cells, column_cache).await?;
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

/// Writes every buffered column value for one row in a single upsert, so a
/// new row is materialized with all known columns at once instead of via an
/// empty skeleton insert followed by per-column updates (which would trip a
/// `NOT NULL` column with no `DEFAULT`).
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

    // Later cells for the same column win (matches the per-cell HLC race
    // already resolved before buffering).
    let mut values: HashMap<String, Option<Vec<u8>>> = HashMap::new();
    for cell in cells {
        values.insert(cell.col, cell.value);
    }

    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = primary_key_columns(table, &columns)?;
    let pk_values = parse_row_id(table, &key.row_id, pk_columns.len())?;

    upsert_row(tx, table, &pk_columns, &pk_values, &columns, values).await
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

    // The primary key is taken from `pk_values` (already decoded from
    // `row_id`), not re-read from the payload — `row_id` is what the merge
    // conflict was resolved against, so it's the source of truth here.
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

/// Writes one row, given its known non-primary-key column values as raw
/// bytes. Shared by both granularities: column-mode (already raw bytes) and
/// row-mode (converted from a JSON payload). Each value is `CAST` back to its
/// destination column's affinity (see `column_affinity`) since both callers
/// hand it opaque bytes rather than typed values.
///
/// Tries `UPDATE` first, falling back to `INSERT` only if no row matched —
/// rather than a single `INSERT ... ON CONFLICT DO UPDATE`, which SQLite
/// evaluates as a candidate insert *before* resolving the conflict: any
/// `NOT NULL` column absent from `values` (column-mode only sends changed
/// columns) would fail that candidate insert even though the existing row
/// already has it set, since the violation never falls through to
/// `DO UPDATE`. `values` may be empty, in which case this is a no-op for an
/// existing row.
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

    // `?{idx} AS <affinity>` for a given column, or the bare placeholder for
    // a `BLOB`-affinity one (no conversion needed).
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
    } else {
        let pk_predicate: String = pk_idents
            .iter()
            .enumerate()
            .map(|(i, ident)| format!("{ident} = ?{}", i + 1))
            .collect::<Vec<_>>()
            .join(" AND ");
        let exists_sql = format!(
            "SELECT EXISTS(SELECT 1 FROM {} WHERE {pk_predicate})",
            quote_ident(table)
        );
        let mut query = sqlx::query_scalar(sqlx::AssertSqlSafe(exists_sql));
        for value in pk_values {
            query = query.bind(value);
        }
        if query.fetch_one(&mut *tx).await? {
            return Ok(());
        }
    }

    // No existing row matched, so this is genuinely new: insert with
    // whatever columns are known. A missing `NOT NULL` column with no
    // default correctly surfaces as a constraint error here.
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

/// Converts a JSON scalar from a row-mode payload into the same raw-bytes
/// representation column-mode cells carry, so both paths can share
/// `upsert_row`'s `CAST`-based binding.
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
