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
/// attempt flushing what remains buffered — first topping each row up from the
/// local cell log (see `backfill_required_columns_from_cell_log`). A row still
/// missing a `NOT NULL` column even then (e.g. another device is still mid-push
/// for it) just stays buffered for a retry on the next sync, rather than
/// failing this one, and suppresses foreign key repair for the cycle.
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
    //
    // Skipped entirely while any row is still unmaterialized: because repairs
    // are pushed, repairing against a knowingly-incomplete local state would
    // propagate deletions of rows that are perfectly intact everywhere else —
    // a buffered row is absent locally, so every reference to it looks like a
    // dangling foreign key and `DiscardRow`/the unconfigured-FK fallback would
    // delete the referencing rows and replicate those tombstones outward. The
    // remaining pages' work simply doesn't commit (see `sync_inner`'s
    // `has_unresolved_foreign_keys` gate) and is re-pulled next sync.
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

/// [`try_flush_pending`] for callers running *outside* an [`apply_remote`]
/// page, i.e. `SyncStore::has_pending_changes`, which `sync_inner` calls
/// between pages to decide whether it is safe to commit.
///
/// Such a caller must raise the `sync_applying` guard itself. Materializing a
/// row writes to the base table, which fires that table's change-tracking
/// triggers; unguarded, every column of every row flushed here is staged in
/// `sync_cells` under *this* device's id and `hlc_now()`, so the next push
/// echoes freshly pulled remote data straight back to the server as if it were
/// a local edit. It also overwrites the remote cell's recorded HLC and
/// device id, corrupting the basis for later merge decisions.
pub(super) async fn flush_pending_outside_page(
    tx: &mut SqliteConnection,
    pending: &PendingBuffer,
) -> Result<bool, SyncError> {
    mark_applying(tx).await?;

    let result = try_flush_pending(&mut *tx, pending).await;

    // Must always run, but its own error must never shadow a real flush
    // failure with a misleading cleanup error.
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

/// Best-effort flush of whatever is buffered in `pending`, without waiting
/// for the last page. Each row is upserted inside its own `SAVEPOINT`: one
/// whose required columns have all arrived is written and removed from the
/// buffer, while one still missing a column is rolled back and stays
/// buffered. Returns whether any row is still buffered afterwards.
///
/// Assumes the `sync_applying` guard is already raised — call
/// [`flush_pending_outside_page`] instead from outside an [`apply_remote`] page.
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
) -> Result<(), SyncError> {
    apply_remote_inner(tx, batch, pending).await?;

    if is_last_page && try_flush_pending(tx, pending).await? {
        log::warn!(
            "apply_remote: reached the last pulled page with one or more rows still \
             missing required columns; left them buffered for a retry on the next sync"
        );
        log_incomplete_pending_rows(tx, pending).await?;
    }

    Ok(())
}

/// Reports every row still buffered after the final page's flush attempt:
/// which columns arrived over the wire, which required ones are missing, and
/// which columns the *local* cell log already holds for that row.
///
/// The last part is the one that distinguishes the two causes of an incomplete
/// row, which a bare `NOT NULL constraint failed` cannot:
/// - the missing columns are absent from `sync_cells` too — the server really
///   hasn't got them yet (another device is mid-push), so the next sync fixes
///   it by itself;
/// - the missing columns *are* in `sync_cells` — they were pulled by an earlier
///   cycle whose cursor already committed past them, so the server will never
///   resend them and this row can never materialize from the wire alone. That
///   one is permanent and needs the values read back out of `sync_cells`.
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

/// Fills in the columns a new row's `INSERT` must supply (`NOT NULL`, no
/// `DEFAULT`) but that this pull didn't deliver, reading them from the local
/// `sync_cells` log.
///
/// `sync_cells` is the durable, complete record of every cell this device has
/// won, whereas the pending buffer only ever holds what arrived over the wire
/// during *this* pull — and a row can legitimately lose buffered columns
/// mid-cycle while the cursor still commits past them:
///
/// - a `DeleteRow` for the row clears its buffered cells (see
///   `apply_remote_inner`), after which a newer cell resurrects the row with
///   only a subset of its columns;
/// - a cell that loses its HLC comparison against `sync_cells` is skipped
///   before ever reaching the buffer.
///
/// Either way the server will not resend those columns, so without consulting
/// the cell log the row could never be materialized again and the constraint
/// failure would be permanent rather than transient.
///
/// Only runs for a row that doesn't exist yet: an existing row already
/// satisfies its `NOT NULL` columns, so the `UPDATE` path needs nothing added.
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

/// Whether a row with these primary key values exists in `table`.
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
    } else if row_exists(tx, table, pk_columns, pk_values).await? {
        return Ok(());
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
