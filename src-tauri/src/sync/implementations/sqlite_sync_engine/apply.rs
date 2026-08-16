use std::collections::HashMap;
use std::str::FromStr;

use sqlx::{Row, SqliteConnection};

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::sql_functions;
use crate::sync::utils::merge::{self, MergeAction};
use crate::sync::value_objects::granularity::Granularity;

use super::column_info::{read_table_info, text_primary_key_columns};
use super::models::ColumnInfo;
use super::trigger_sql::quote_ident;

pub(super) async fn apply_remote(
    tx: &mut SqliteConnection,
    batch: ChangeBatch,
) -> Result<(), SyncError> {
    // `sync_applying` is a regular table created by the sync tables migration
    // (see its comment there for why it can't be a TEMP table). Cleanup runs
    // on both the success and error paths so a caller that doesn't roll back
    // an errored transaction still leaves this row cleared.
    sqlx::query("INSERT INTO sync_applying(x) VALUES (1)")
        .execute(&mut *tx)
        .await?;

    let result = apply_remote_inner(&mut *tx, &batch).await;

    sqlx::query("DELETE FROM sync_applying")
        .execute(&mut *tx)
        .await?;

    result
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

async fn apply_remote_inner(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
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
            tombstone_hlc.as_ref(),
            granularity,
        )?;

        apply_action(tx, &cell.tbl, &cell.row_id, action, &mut column_cache).await?;
    }

    Ok(())
}

/// SQLite's column affinity rules (https://www.sqlite.org/datatype3.html#determination_of_column_affinity),
/// used to `CAST` an opaque cell value back into its destination column's usual
/// storage class before writing it.
fn column_affinity(declared_type: &str) -> &'static str {
    let upper = declared_type.to_uppercase();
    if upper.contains("INT") {
        "INTEGER"
    } else if upper.contains("CHAR") || upper.contains("CLOB") || upper.contains("TEXT") {
        "TEXT"
    } else if upper.contains("BLOB") || upper.is_empty() {
        "BLOB"
    } else if upper.contains("REAL") || upper.contains("FLOA") || upper.contains("DOUB") {
        "REAL"
    } else {
        "NUMERIC"
    }
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

/// Decodes a `row_id` (see `trigger_sql::row_id_expr`) into its primary key
/// values, in the same key-column order it was encoded with.
fn parse_row_id(table: &str, row_id: &str, expected_len: usize) -> Result<Vec<String>, SyncError> {
    let values: Vec<serde_json::Value> =
        serde_json::from_str(row_id).map_err(|err| SyncError::InvalidRowPayload {
            table: table.to_string(),
            reason: format!("row_id was not a JSON array: {err}"),
        })?;

    if values.len() != expected_len {
        return Err(SyncError::InvalidRowPayload {
            table: table.to_string(),
            reason: format!(
                "row_id has {} value(s), expected {expected_len} for this table's primary key",
                values.len()
            ),
        });
    }

    values
        .into_iter()
        .map(|v| {
            v.as_str()
                .map(str::to_string)
                .ok_or_else(|| SyncError::InvalidRowPayload {
                    table: table.to_string(),
                    reason: "row_id contained a non-string primary key value".to_string(),
                })
        })
        .collect()
}

async fn apply_action(
    tx: &mut SqliteConnection,
    table: &str,
    row_id: &str,
    action: MergeAction,
    column_cache: &mut HashMap<String, Vec<ColumnInfo>>,
) -> Result<(), SyncError> {
    let columns = get_or_load_columns(tx, table, column_cache).await?;
    let pk_columns = text_primary_key_columns(table, &columns)?;
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
        // TODO: continue review in here
        MergeAction::SetColumn { col, value } => {
            let Some(column_info) = columns.iter().find(|c| c.name == col) else {
                return Err(SyncError::UnknownColumn {
                    table: table.to_string(),
                    col,
                });
            };
            // Cells are carried as opaque bytes (BLOB storage class); SQLite's
            // BLOB affinity leaves a value's storage class untouched on write, so
            // without an explicit CAST a TEXT/NUMERIC-affinity destination column
            // would end up storing BLOB instead of its usual type, and a later
            // typed read (e.g. as `String`) would fail to decode it.
            let affinity = column_affinity(&column_info.col_type);

            let pk_idents: Vec<String> = pk_columns.iter().map(|c| quote_ident(&c.name)).collect();
            let pk_placeholders: Vec<String> =
                (1..=pk_columns.len()).map(|i| format!("?{i}")).collect();
            let skeleton_sql = format!(
                "INSERT INTO {}({}) VALUES ({}) ON CONFLICT({}) DO NOTHING",
                quote_ident(table),
                pk_idents.join(","),
                pk_placeholders.join(","),
                pk_idents.join(",")
            );
            let mut query = sqlx::query(sqlx::AssertSqlSafe(skeleton_sql));
            for value in &pk_values {
                query = query.bind(value);
            }
            query.execute(&mut *tx).await?;

            let where_clause: String = pk_columns
                .iter()
                .enumerate()
                .map(|(i, c)| format!("{} = ?{}", quote_ident(&c.name), i + 2))
                .collect::<Vec<_>>()
                .join(" AND ");
            let update_sql = if affinity == "BLOB" {
                format!(
                    "UPDATE {} SET {} = ?1 WHERE {}",
                    quote_ident(table),
                    quote_ident(&col),
                    where_clause
                )
            } else {
                format!(
                    "UPDATE {} SET {} = CAST(?1 AS {}) WHERE {}",
                    quote_ident(table),
                    quote_ident(&col),
                    affinity,
                    where_clause
                )
            };
            let mut query = sqlx::query(sqlx::AssertSqlSafe(update_sql)).bind(value);
            for value in &pk_values {
                query = query.bind(value);
            }
            query.execute(&mut *tx).await?;

            Ok(())
        }
        MergeAction::UpsertRow { value } => {
            let pk_column_names: Vec<String> = text_primary_key_columns(table, &columns)?
                .iter()
                .map(|c| c.name.clone())
                .collect();

            apply_row_upsert(tx, table, &pk_column_names, &columns, row_id, &value).await
        }
    }
}

async fn apply_row_upsert(
    tx: &mut SqliteConnection,
    table: &str,
    pk_columns: &[String],
    columns: &[ColumnInfo],
    row_id: &str,
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

    let pk_values_from_row_id = parse_row_id(table, row_id, pk_columns.len())?;
    // TODO: is this needed? if not remove it
    for (pk_column, expected_value) in pk_columns.iter().zip(&pk_values_from_row_id) {
        let actual_value = obj.get(pk_column).and_then(|v| v.as_str()).ok_or_else(|| {
            SyncError::InvalidRowPayload {
                table: table.to_string(),
                reason: format!("payload missing primary key '{pk_column}'"),
            }
        })?;
        if actual_value != expected_value {
            return Err(SyncError::InvalidRowPayload {
                table: table.to_string(),
                reason: format!(
                    "payload primary key '{pk_column}' value '{actual_value}' does not match row id value '{expected_value}'"
                ),
            });
        }
    }

    let column_names: Vec<&str> = columns.iter().map(|c| c.name.as_str()).collect();
    let mut keys: Vec<String> = obj
        .keys()
        .filter(|k| column_names.contains(&k.as_str()))
        .cloned()
        .collect();
    for pk_column in pk_columns {
        if !keys.iter().any(|k| k == pk_column) {
            keys.push(pk_column.clone());
        }
    }
    keys.sort();
    keys.dedup();

    let quoted_columns: Vec<String> = keys.iter().map(|k| quote_ident(k)).collect();
    let placeholders: Vec<String> = (1..=keys.len()).map(|i| format!("?{i}")).collect();
    let update_clause: Vec<String> = keys
        .iter()
        .filter(|k| !pk_columns.iter().any(|pk| pk == *k))
        .map(|k| format!("{} = excluded.{}", quote_ident(k), quote_ident(k)))
        .collect();
    let conflict_columns: Vec<String> = pk_columns.iter().map(|c| quote_ident(c)).collect();

    let sql = if update_clause.is_empty() {
        format!(
            "INSERT INTO {}({}) VALUES ({}) ON CONFLICT({}) DO NOTHING",
            quote_ident(table),
            quoted_columns.join(","),
            placeholders.join(","),
            conflict_columns.join(",")
        )
    } else {
        format!(
            "INSERT INTO {}({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
            quote_ident(table),
            quoted_columns.join(","),
            placeholders.join(","),
            conflict_columns.join(","),
            update_clause.join(",")
        )
    };

    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for key in &keys {
        let value = obj
            .get(key.as_str())
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        query = match value {
            serde_json::Value::Null => query.bind(None::<String>),
            serde_json::Value::Bool(b) => query.bind(b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query.bind(i)
                } else if let Some(f) = n.as_f64() {
                    query.bind(f)
                } else {
                    return Err(SyncError::InvalidRowPayload {
                        table: table.to_string(),
                        reason: "unsupported numeric value".to_string(),
                    });
                }
            }
            serde_json::Value::String(s) => query.bind(s),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                return Err(SyncError::InvalidRowPayload {
                    table: table.to_string(),
                    reason: "nested JSON values are not supported".to_string(),
                });
            }
        };
    }
    query.execute(&mut *tx).await?;

    Ok(())
}
