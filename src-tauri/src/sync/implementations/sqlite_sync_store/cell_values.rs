use std::collections::{HashMap, HashSet};

use sqlx::{Row, SqliteConnection};

use super::column_info::{primary_key_columns, read_table_info};
use super::models::ColumnInfo;
use super::pending_cells;
use super::trigger_sql::quote_ident;
use crate::sync::errors::SyncError;
use crate::sync::utils::merge;
use crate::sync::value_objects::granularity::Granularity;

/// Rows per query, bound as one JSON array.
const ROWS_PER_QUERY: usize = 500;

/// A cell's `(row_id, col)`.
pub(super) type CellKey = (String, String);

/// `table`'s `cells` as their rows hold them (a column's bytes, a row-mode row's JSON), else as stored in
/// `sync_pending_cells` for a row not in its table; a cell in neither, or a tombstone, is left out.
pub(super) async fn read(
    tx: &mut SqliteConnection,
    table: &str,
    granularity: Granularity,
    cells: &[CellKey],
) -> Result<HashMap<CellKey, Option<Vec<u8>>>, SyncError> {
    let columns = read_table_info(tx, table).await?;
    if columns.is_empty() {
        return Err(SyncError::TableNotFound(table.to_string()));
    }
    let wanted: Vec<&CellKey> = cells
        .iter()
        .filter(|(_, col)| col != merge::DELETED_COL)
        .collect();

    let mut values = HashMap::new();
    let mut found_rows = HashSet::new();
    match granularity {
        Granularity::Row => {
            let row_ids: Vec<&str> = wanted.iter().map(|(row_id, _)| row_id.as_str()).collect();
            let select = row_json_expr("t", &columns, table)?;
            for (row_id, value) in read_rows(tx, table, &columns, &select, &row_ids).await? {
                found_rows.insert(row_id.clone());
                values.insert((row_id, merge::ROW_COL.to_string()), value);
            }
        }
        Granularity::Column => {
            let row_ids: Vec<&str> = wanted.iter().map(|(row_id, _)| row_id.as_str()).collect();
            for (row_id, _) in read_rows(tx, table, &columns, "NULL", &row_ids).await? {
                found_rows.insert(row_id);
            }
            // One query per column, so a large column (a PDF's data) is read only for rows that changed it.
            let mut rows_by_column: HashMap<&str, Vec<&str>> = HashMap::new();
            for (row_id, col) in &wanted {
                rows_by_column.entry(col).or_default().push(row_id);
            }
            for (col, row_ids) in rows_by_column {
                if !columns.iter().any(|c| c.name == col && !c.is_primary_key()) {
                    continue;
                }
                let select = format!("CAST(t.{} AS BLOB)", quote_ident(col));
                for (row_id, value) in read_rows(tx, table, &columns, &select, &row_ids).await? {
                    values.insert((row_id, col.to_string()), value);
                }
            }
        }
    }

    let wanted_set: HashSet<&CellKey> = wanted.iter().copied().collect();
    let missing_rows: HashSet<&str> = wanted
        .iter()
        .map(|(row_id, _)| row_id.as_str())
        .filter(|row_id| !found_rows.contains(*row_id))
        .collect();
    for row_id in missing_rows {
        for (col, value) in pending_cells::stored(tx, table, row_id).await? {
            let key = (row_id.to_string(), col);
            if wanted_set.contains(&key) {
                values.insert(key, value);
            }
        }
    }

    Ok(values)
}

/// `select` (over alias `t`) for each of `row_ids` found in `table`, as `(row_id, value)`.
async fn read_rows(
    tx: &mut SqliteConnection,
    table: &str,
    columns: &[ColumnInfo],
    select: &str,
    row_ids: &[&str],
) -> Result<Vec<(String, Option<Vec<u8>>)>, SyncError> {
    let pk_columns = primary_key_columns(table, columns)?;
    let join: String = pk_columns
        .iter()
        .enumerate()
        .map(|(i, c)| format!("t.{} = keys.value ->> {i}", quote_ident(&c.name)))
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!(
        "SELECT keys.value AS row_id, {select} AS value
         FROM json_each(?1) AS keys JOIN {} AS t ON {join}",
        quote_ident(table)
    );

    let mut unique: Vec<&str> = row_ids.to_vec();
    unique.sort_unstable();
    unique.dedup();

    let mut found = Vec::with_capacity(unique.len());
    for chunk in unique.chunks(ROWS_PER_QUERY) {
        let keys = serde_json::to_string(chunk).expect("a list of strings always serializes");
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql.clone()))
            .bind(keys)
            .fetch_all(&mut *tx)
            .await?;
        for row in rows {
            found.push((row.try_get("row_id")?, row.try_get("value")?));
        }
    }

    Ok(found)
}

/// A row-mode row as its JSON payload: every column, keys first, as `apply_row_upsert` reads it.
fn row_json_expr(alias: &str, columns: &[ColumnInfo], table: &str) -> Result<String, SyncError> {
    let pk_columns = primary_key_columns(table, columns)?;
    let pairs: Vec<String> = pk_columns
        .iter()
        .copied()
        .chain(columns.iter().filter(|c| !c.is_primary_key()))
        .map(|c| {
            format!(
                "'{}', {alias}.{}",
                c.name.replace('\'', "''"),
                quote_ident(&c.name)
            )
        })
        .collect();
    Ok(format!("CAST(json_object({}) AS BLOB)", pairs.join(", ")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn column(name: &str, pk_position: Option<u32>) -> ColumnInfo {
        ColumnInfo {
            name: name.to_string(),
            col_type: "TEXT".to_string(),
            pk_position,
            notnull: false,
            has_default: false,
        }
    }

    #[test]
    fn row_json_expr_composite_key_puts_every_key_column_first_in_key_order() {
        // Arrange

        let columns = vec![
            column("title", None),
            column("id", Some(2)),
            column("workspace_id", Some(1)),
        ];

        // Act

        let actual = row_json_expr("t", &columns, "notes").unwrap();

        // Assert

        assert_eq!(
            "CAST(json_object('workspace_id', t.\"workspace_id\", 'id', t.\"id\", 'title', t.\"title\") AS BLOB)",
            actual
        );
    }
}
