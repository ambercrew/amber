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
        columns.push(ColumnInfo {
            name: row.try_get("name")?,
            col_type: row.try_get("type")?,
            pk_position: (pk != 0).then_some(pk as u32),
        });
    }

    Ok(columns)
}

/// Returns this table's primary key columns, ordered by their position within
/// the key (so callers can encode/decode `row_id` consistently). Errors if the
/// table has no primary key or any key column isn't TEXT — `row_id` is always
/// carried as text (see `trigger_sql::row_id_expr`), so a non-TEXT key column
/// would silently lose type information on the round trip through `sync_cells`.
pub(super) fn text_primary_key_columns<'a>(
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
        .find(|c| !c.col_type.eq_ignore_ascii_case("TEXT"))
    {
        return Err(SyncError::InvalidPrimaryKey {
            table: table.to_string(),
            details: format!(
                "primary key column '{}' must be TEXT, found '{}'",
                bad_column.name, bad_column.col_type
            ),
        });
    }

    Ok(pk_columns)
}
