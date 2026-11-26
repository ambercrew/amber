use super::models::TableSchema;
use crate::sync::errors::SyncError;
use crate::sync::utils::merge::{DELETED_COL, ROW_COL};

/// Cells hold no value, read from the row when pushed (see `cell_values`).
const UPSERT_CONFLICT_CLAUSE: &str =
    "ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0";
const APPLYING_GUARD: &str = "WHEN NOT EXISTS (SELECT 1 FROM sync_applying)";
/// Lets `backfill_via_trigger` bypass the `au` trigger's per-column "did this
/// change" filter, so its no-op self-assignment `UPDATE` still writes a cell.
const BACKFILLING_BYPASS: &str = "OR EXISTS (SELECT 1 FROM sync_backfilling)";

pub fn drop_trigger_sql(table: &str) -> Vec<String> {
    ["ai", "au", "ad"]
        .iter()
        .map(|suffix| format!("DROP TRIGGER IF EXISTS sync_{table}_{suffix}"))
        .collect()
}

pub fn column_mode_triggers(schema: &TableSchema) -> Vec<String> {
    let table = &schema.name;
    let row_id_new = row_id_expr("NEW", &schema.pk_columns);
    let quoted_table = quote_ident(table);

    let insert_statements: String = schema
        .non_pk_columns
        .iter()
        .map(|col| {
            format!(
                "  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('{table}', {row_id_new}, '{col}', hlc_now(), 0)
  {UPSERT_CONFLICT_CLAUSE};
"
            )
        })
        .collect();

    let ai = format!(
        "CREATE TRIGGER sync_{table}_ai AFTER INSERT ON {quoted_table}
{guard}
BEGIN
{insert_statements}END;",
        guard = APPLYING_GUARD
    );

    let update_statements: String = schema
        .non_pk_columns
        .iter()
        .map(|col| {
            let quoted_col = quote_ident(col);
            format!(
                "  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote)
  SELECT '{table}', {row_id_new}, '{col}', hlc_now(), 0
  WHERE NEW.{quoted_col} IS NOT OLD.{quoted_col} {BACKFILLING_BYPASS}
  {UPSERT_CONFLICT_CLAUSE};
"
            )
        })
        .collect();

    let au = format!(
        "CREATE TRIGGER sync_{table}_au AFTER UPDATE ON {quoted_table}
{guard}
BEGIN
{update_statements}END;",
        guard = APPLYING_GUARD
    );

    let ad = delete_trigger(table, &schema.pk_columns, &quoted_table);

    vec![ai, au, ad]
}

pub fn row_mode_triggers(schema: &TableSchema) -> Vec<String> {
    let table = &schema.name;
    let row_id_new = row_id_expr("NEW", &schema.pk_columns);
    let quoted_table = quote_ident(table);

    // The row's JSON is only built when pushed, so a BLOB value is refused here, where its writer sees it.
    let blob_check: String = schema
        .pk_columns
        .iter()
        .chain(&schema.non_pk_columns)
        .map(|col| format!("typeof(NEW.{}) = 'blob'", quote_ident(col)))
        .collect::<Vec<_>>()
        .join(" OR ");
    let message =
        format!("Table '{table}' syncs by row, whose JSON payload can't hold a BLOB value")
            .replace('\'', "''");
    let row_upsert = format!(
        "  SELECT RAISE(ABORT, '{message}') WHERE {blob_check};
  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('{table}', {row_id_new}, '{ROW_COL}', hlc_now(), 0)
  {UPSERT_CONFLICT_CLAUSE};
"
    );

    let ai = format!(
        "CREATE TRIGGER sync_{table}_ai AFTER INSERT ON {quoted_table}
{guard}
BEGIN
{row_upsert}END;",
        guard = APPLYING_GUARD
    );

    let au = format!(
        "CREATE TRIGGER sync_{table}_au AFTER UPDATE ON {quoted_table}
{guard}
BEGIN
{row_upsert}END;",
        guard = APPLYING_GUARD
    );

    let ad = delete_trigger(table, &schema.pk_columns, &quoted_table);

    vec![ai, au, ad]
}

/// Seeds `sync_cells` for rows that predate registration with a no-op self-assigning `UPDATE` that fires
/// the `au` trigger; the `sync_backfilling` guard lifts its `NEW.col IS NOT OLD.col` filter.
pub fn backfill_via_trigger(schema: &TableSchema) -> Vec<String> {
    let quoted_table = quote_ident(&schema.name);
    let touch_col = quote_ident(
        schema
            .pk_columns
            .first()
            .expect("every synced table has at least one primary key column"),
    );

    vec![
        "INSERT INTO sync_backfilling(x) VALUES (1)".to_string(),
        format!("UPDATE {quoted_table} SET {touch_col} = {touch_col}"),
        "DELETE FROM sync_backfilling".to_string(),
    ]
}

/// Drops the row's other cells before writing its tombstone, so only the tombstone is pushed.
fn delete_trigger(table: &str, pk_columns: &[String], quoted_table: &str) -> String {
    let row_id_old = row_id_expr("OLD", pk_columns);
    format!(
        "CREATE TRIGGER sync_{table}_ad AFTER DELETE ON {quoted_table}
{guard}
BEGIN
  DELETE FROM sync_cells WHERE tbl = '{table}' AND row_id = {row_id_old} AND col <> '{DELETED_COL}';
  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('{table}', {row_id_old}, '{DELETED_COL}', hlc_now(), 0)
  {UPSERT_CONFLICT_CLAUSE};
END;",
        guard = APPLYING_GUARD
    )
}

/// A trigger's `row_id` expression: a JSON array of `prefix`'s (`NEW`/`OLD`) primary key values in key
/// order, which keeps composite keys unambiguous whatever they contain.
fn row_id_expr(prefix: &str, pk_columns: &[String]) -> String {
    let args: String = pk_columns
        .iter()
        .map(|col| format!("{prefix}.{}", quote_ident(col)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("json_array({args})")
}

/// Decodes a `row_id` (see `row_id_expr`) into its key values, in order. They stay text until bound,
/// where SQLite's affinity conversion restores each column's storage class.
pub(super) fn parse_row_id(
    table: &str,
    row_id: &str,
    expected_len: usize,
) -> Result<Vec<String>, SyncError> {
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
        .map(|v| match v {
            serde_json::Value::String(s) => Ok(s),
            serde_json::Value::Number(n) => Ok(n.to_string()),
            _ => Err(SyncError::InvalidRowPayload {
                table: table.to_string(),
                reason:
                    "row_id contained a primary key value that was neither a string nor a number"
                        .to_string(),
            }),
        })
        .collect()
}

/// Double-quotes a SQL identifier, escaping embedded double quotes.
pub(crate) fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes_schema() -> TableSchema {
        TableSchema {
            name: "notes".to_string(),
            pk_columns: vec!["id".to_string()],
            non_pk_columns: vec!["title".to_string(), "body".to_string()],
        }
    }

    fn notes_composite_schema() -> TableSchema {
        TableSchema {
            name: "notes".to_string(),
            pk_columns: vec!["workspace_id".to_string(), "id".to_string()],
            non_pk_columns: vec!["title".to_string()],
        }
    }

    #[test]
    fn drop_trigger_sql_returns_three_drop_statements() {
        // Arrange

        let table = "notes";

        // Act

        let actual = drop_trigger_sql(table);

        // Assert

        assert_eq!(
            vec![
                "DROP TRIGGER IF EXISTS sync_notes_ai".to_string(),
                "DROP TRIGGER IF EXISTS sync_notes_au".to_string(),
                "DROP TRIGGER IF EXISTS sync_notes_ad".to_string(),
            ],
            actual
        );
    }

    #[test]
    fn column_mode_triggers_matches_expected_sql() {
        // Arrange

        let schema = notes_schema();

        // Act

        let actual = column_mode_triggers(&schema);

        // Assert

        assert_eq!(
            "CREATE TRIGGER sync_notes_ai AFTER INSERT ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(NEW.\"id\"), 'title', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(NEW.\"id\"), 'body', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[0]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_au AFTER UPDATE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote)\n  SELECT 'notes', json_array(NEW.\"id\"), 'title', hlc_now(), 0\n  WHERE NEW.\"title\" IS NOT OLD.\"title\" OR EXISTS (SELECT 1 FROM sync_backfilling)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote)\n  SELECT 'notes', json_array(NEW.\"id\"), 'body', hlc_now(), 0\n  WHERE NEW.\"body\" IS NOT OLD.\"body\" OR EXISTS (SELECT 1 FROM sync_backfilling)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[1]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_ad AFTER DELETE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  DELETE FROM sync_cells WHERE tbl = 'notes' AND row_id = json_array(OLD.\"id\") AND col <> '__deleted';\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(OLD.\"id\"), '__deleted', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[2]
        );
    }

    #[test]
    fn row_mode_triggers_matches_expected_sql() {
        // Arrange

        let schema = notes_schema();

        // Act

        let actual = row_mode_triggers(&schema);

        // Assert

        assert_eq!(
            "CREATE TRIGGER sync_notes_ai AFTER INSERT ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  SELECT RAISE(ABORT, 'Table ''notes'' syncs by row, whose JSON payload can''t hold a BLOB value') WHERE typeof(NEW.\"id\") = 'blob' OR typeof(NEW.\"title\") = 'blob' OR typeof(NEW.\"body\") = 'blob';\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(NEW.\"id\"), '__row', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[0]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_au AFTER UPDATE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  SELECT RAISE(ABORT, 'Table ''notes'' syncs by row, whose JSON payload can''t hold a BLOB value') WHERE typeof(NEW.\"id\") = 'blob' OR typeof(NEW.\"title\") = 'blob' OR typeof(NEW.\"body\") = 'blob';\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(NEW.\"id\"), '__row', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[1]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_ad AFTER DELETE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  DELETE FROM sync_cells WHERE tbl = 'notes' AND row_id = json_array(OLD.\"id\") AND col <> '__deleted';\n  INSERT INTO sync_cells(tbl,row_id,col,hlc,is_remote) VALUES ('notes', json_array(OLD.\"id\"), '__deleted', hlc_now(), 0)\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET hlc=excluded.hlc, is_remote=0;\nEND;",
            actual[2]
        );
    }

    #[test]
    fn column_mode_triggers_composite_key_encodes_row_id_as_json_array_in_key_order() {
        // Arrange

        let schema = notes_composite_schema();

        // Act

        let actual = column_mode_triggers(&schema);

        // Assert

        assert!(actual[0].contains("json_array(NEW.\"workspace_id\", NEW.\"id\")"));
        assert!(actual[2].contains("json_array(OLD.\"workspace_id\", OLD.\"id\")"));
    }

    #[test]
    fn drop_trigger_sql_all_triggers_are_guarded_by_sync_applying() {
        // Arrange

        let schema = notes_schema();

        // Act

        let column_triggers = column_mode_triggers(&schema);
        let row_triggers = row_mode_triggers(&schema);

        // Assert

        for trigger in column_triggers.iter().chain(row_triggers.iter()) {
            assert!(trigger.contains("WHEN NOT EXISTS (SELECT 1 FROM sync_applying)"));
        }
    }

    #[test]
    fn quote_ident_escapes_embedded_double_quotes() {
        // Arrange

        let schema = TableSchema {
            name: "weird".to_string(),
            pk_columns: vec!["id".to_string()],
            non_pk_columns: vec!["a\"b".to_string()],
        };

        // Act

        let actual = column_mode_triggers(&schema);

        // Assert

        assert!(actual[1].contains("NEW.\"a\"\"b\" IS NOT OLD.\"a\"\"b\""));
    }
}
