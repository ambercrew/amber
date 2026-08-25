use sqlx::{Row, SqliteConnection};

use super::models::ColumnInfo;
use super::trigger_sql::quote_ident;
use crate::sync::errors::SyncError;

pub(super) async fn read_table_info(
    conn: &mut SqliteConnection,
    table: &str,
) -> Result<Vec<ColumnInfo>, SyncError> {
    let sql = format!("PRAGMA table_info({})", quote_ident(table));
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .fetch_all(&mut *conn)
        .await?;

    let mut columns = Vec::with_capacity(rows.len());
    for row in rows {
        let pk: i64 = row.try_get("pk")?;
        let notnull: i64 = row.try_get("notnull")?;
        let default_value: Option<String> = row.try_get("dflt_value")?;
        columns.push(ColumnInfo {
            name: row.try_get("name")?,
            col_type: row.try_get("type")?,
            pk_position: (pk != 0).then_some(pk as u32),
            notnull: notnull != 0,
            has_default: default_value.is_some(),
        });
    }

    Ok(columns)
}

/// Returns this table's primary key columns, ordered by their position within
/// the key (so callers can encode/decode `row_id` consistently). Errors if the
/// table has no primary key or any key column has BLOB affinity.
pub(super) fn primary_key_columns<'a>(
    table: &str,
    columns: &'a [ColumnInfo],
) -> Result<Vec<&'a ColumnInfo>, SyncError> {
    let mut pk_columns: Vec<&ColumnInfo> = columns.iter().filter(|c| c.is_primary_key()).collect();

    if pk_columns.is_empty() {
        return Err(SyncError::InvalidPrimaryKey {
            table: table.to_string(),
            details: "table has no primary key".to_string(),
        });
    }
    pk_columns.sort_by_key(|c| c.pk_position);

    if let Some(bad_column) = pk_columns
        .iter()
        .find(|c| column_affinity(&c.col_type) == "BLOB")
    {
        return Err(SyncError::InvalidPrimaryKey {
            table: table.to_string(),
            details: format!(
                "primary key column '{}' must not have BLOB affinity, found '{}'",
                bad_column.name, bad_column.col_type
            ),
        });
    }

    Ok(pk_columns)
}

/// SQLite's column affinity rules (https://www.sqlite.org/datatype3.html#determination_of_column_affinity):
/// used to `CAST` an opaque cell value back to its destination column's
/// storage class, and to decide which primary key column types `row_id`
/// can round-trip.
pub(super) fn column_affinity(declared_type: &str) -> &'static str {
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
