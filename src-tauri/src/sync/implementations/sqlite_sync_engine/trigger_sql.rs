use super::models::TableSchema;
use crate::sync::utils::merge::{DELETED_COL, ROW_COL};

const UPSERT_CONFLICT_CLAUSE: &str = "ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id";

/// Double-quotes a SQL identifier, escaping embedded double quotes. Identifiers
/// come from `PRAGMA table_info`, not user input, but this is cheap insurance.
pub(crate) fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

/// Builds the `row_id` SQL expression for a trigger body: a JSON array of the
/// primary key column values (in key order), taken from `prefix` (`"NEW"` or
/// `"OLD"`). A JSON array — rather than e.g. delimiter-joining the values —
/// keeps composite keys unambiguous no matter what characters the individual
/// values contain, and needs no special case for single-column keys.
fn row_id_expr(prefix: &str, pk_columns: &[String]) -> String {
    let args: String = pk_columns
        .iter()
        .map(|col| format!("{prefix}.{}", quote_ident(col)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("json_array({args})")
}

fn applying_guard() -> &'static str {
    "WHEN NOT EXISTS (SELECT 1 FROM sync_applying)"
}

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
        .columns
        .iter()
        .map(|col| {
            let quoted_col = quote_ident(col);
            format!(
                "  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('{table}', {row_id_new}, '{col}', NEW.{quoted_col}, hlc_now(), device_id())
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
        guard = applying_guard()
    );

    let update_statements: String = schema
        .columns
        .iter()
        .map(|col| {
            let quoted_col = quote_ident(col);
            format!(
                "  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id)
  SELECT '{table}', {row_id_new}, '{col}', NEW.{quoted_col}, hlc_now(), device_id()
  WHERE NEW.{quoted_col} IS NOT OLD.{quoted_col}
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
        guard = applying_guard()
    );

    let ad = delete_trigger(table, &schema.pk_columns, &quoted_table);

    vec![ai, au, ad]
}

pub fn row_mode_triggers(schema: &TableSchema) -> Vec<String> {
    let table = &schema.name;
    let row_id_new = row_id_expr("NEW", &schema.pk_columns);
    let quoted_table = quote_ident(table);

    let json_pairs: String = schema
        .pk_columns
        .iter()
        .chain(schema.columns.iter())
        .map(|col| {
            let quoted_col = quote_ident(col);
            format!("'{col}', NEW.{quoted_col}")
        })
        .collect::<Vec<_>>()
        .join(", ");

    let row_upsert = format!(
        "  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('{table}', {row_id_new}, '{ROW_COL}', json_object({json_pairs}), hlc_now(), device_id())
  {UPSERT_CONFLICT_CLAUSE};
"
    );

    let ai = format!(
        "CREATE TRIGGER sync_{table}_ai AFTER INSERT ON {quoted_table}
{guard}
BEGIN
{row_upsert}END;",
        guard = applying_guard()
    );

    let au = format!(
        "CREATE TRIGGER sync_{table}_au AFTER UPDATE ON {quoted_table}
{guard}
BEGIN
{row_upsert}END;",
        guard = applying_guard()
    );

    let ad = delete_trigger(table, &schema.pk_columns, &quoted_table);

    vec![ai, au, ad]
}

fn delete_trigger(table: &str, pk_columns: &[String], quoted_table: &str) -> String {
    let row_id_old = row_id_expr("OLD", pk_columns);
    format!(
        "CREATE TRIGGER sync_{table}_ad AFTER DELETE ON {quoted_table}
{guard}
BEGIN
  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('{table}', {row_id_old}, '{DELETED_COL}', NULL, hlc_now(), device_id())
  {UPSERT_CONFLICT_CLAUSE};
END;",
        guard = applying_guard()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes_schema() -> TableSchema {
        TableSchema {
            name: "notes".to_string(),
            pk_columns: vec!["id".to_string()],
            columns: vec!["title".to_string(), "body".to_string()],
        }
    }

    fn notes_composite_schema() -> TableSchema {
        TableSchema {
            name: "notes".to_string(),
            pk_columns: vec!["workspace_id".to_string(), "id".to_string()],
            columns: vec!["title".to_string()],
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
            "CREATE TRIGGER sync_notes_ai AFTER INSERT ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(NEW.\"id\"), 'title', NEW.\"title\", hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(NEW.\"id\"), 'body', NEW.\"body\", hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
            actual[0]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_au AFTER UPDATE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id)\n  SELECT 'notes', json_array(NEW.\"id\"), 'title', NEW.\"title\", hlc_now(), device_id()\n  WHERE NEW.\"title\" IS NOT OLD.\"title\"\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id)\n  SELECT 'notes', json_array(NEW.\"id\"), 'body', NEW.\"body\", hlc_now(), device_id()\n  WHERE NEW.\"body\" IS NOT OLD.\"body\"\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
            actual[1]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_ad AFTER DELETE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(OLD.\"id\"), '__deleted', NULL, hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
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
            "CREATE TRIGGER sync_notes_ai AFTER INSERT ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(NEW.\"id\"), '__row', json_object('id', NEW.\"id\", 'title', NEW.\"title\", 'body', NEW.\"body\"), hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
            actual[0]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_au AFTER UPDATE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(NEW.\"id\"), '__row', json_object('id', NEW.\"id\", 'title', NEW.\"title\", 'body', NEW.\"body\"), hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
            actual[1]
        );

        assert_eq!(
            "CREATE TRIGGER sync_notes_ad AFTER DELETE ON \"notes\"\nWHEN NOT EXISTS (SELECT 1 FROM sync_applying)\nBEGIN\n  INSERT INTO sync_cells(tbl,row_id,col,value,hlc,device_id) VALUES ('notes', json_array(OLD.\"id\"), '__deleted', NULL, hlc_now(), device_id())\n  ON CONFLICT(tbl,row_id,col) DO UPDATE SET value=excluded.value, hlc=excluded.hlc, device_id=excluded.device_id;\nEND;",
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
    fn row_mode_triggers_composite_key_folds_every_key_column_into_json_payload() {
        // Arrange

        let schema = notes_composite_schema();

        // Act

        let actual = row_mode_triggers(&schema);

        // Assert

        assert!(actual[0].contains(
            "json_object('workspace_id', NEW.\"workspace_id\", 'id', NEW.\"id\", 'title', NEW.\"title\")"
        ));
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
            columns: vec!["a\"b".to_string()],
        };

        // Act

        let actual = column_mode_triggers(&schema);

        // Assert

        assert!(actual[0].contains("NEW.\"a\"\"b\""));
    }
}
