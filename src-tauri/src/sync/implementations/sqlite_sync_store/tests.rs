use sqlx::Row;

use injector::injector_scope::InjectorScope;

use super::cell_values;
use crate::generated_code::{CellChange, ChangeBatch};
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::infrastructure::value_objects::db_pool::DbPool;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::sync::errors::SyncError;
use crate::sync::hlc::{DeviceId, Hlc};
use crate::sync::store::SyncStore;
use crate::sync::utils::merge;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::fk_policy::FkPolicy;
use crate::sync::value_objects::granularity::Granularity;
use crate::test_utils::{create_file_backed_test_injector, create_test_injector};

/// Far enough ahead of wall time that a remote cell stamped with it always
/// wins the last-writer-wins merge against anything the local clock issues.
fn far_future_ms() -> u64 {
    crate::sync::hlc::wall_time_ms() + 100_000_000_000
}

/// The device id the test database's own clock stamps cells with.
async fn local_device_id(scope: &InjectorScope<'_>) -> String {
    scope
        .resolve::<DbPool>()
        .await
        .sync_clock()
        .await
        .get()
        .device_id()
        .to_string()
}

async fn create_notes_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, body TEXT)")
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn insert_note(tx: &DbTransaction, id: &str, title: &str, body: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("INSERT INTO notes(id, title, body) VALUES (?1, ?2, ?3)")
        .bind(id)
        .bind(title)
        .bind(body)
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn update_note_title(tx: &DbTransaction, id: &str, title: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("UPDATE notes SET title = ?1 WHERE id = ?2")
        .bind(title)
        .bind(id)
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn delete_note(tx: &DbTransaction, id: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("DELETE FROM notes WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn get_note_title(tx: &DbTransaction, id: &str) -> Option<String> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("SELECT title FROM notes WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .map(|row| row.try_get("title").unwrap())
}

async fn get_note(tx: &DbTransaction, id: &str) -> Option<(Option<String>, Option<String>)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("SELECT title, body FROM notes WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .map(|row| (row.try_get("title").unwrap(), row.try_get("body").unwrap()))
}

async fn note_exists(tx: &DbTransaction, id: &str) -> bool {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("SELECT 1 FROM notes WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .is_some()
}

/// `sync_cells.row_id` is a JSON array of primary key values in key order (see
/// `trigger_sql::row_id_expr`); single-element for `notes`.
fn row_id_json(values: &[&str]) -> String {
    serde_json::to_string(values).unwrap()
}

fn single_row_id(id: &str) -> String {
    row_id_json(&[id])
}

/// A cell's value as a push would send it, read from its row (see `cell_values`).
async fn cell_values_of(
    conn: &mut sqlx::SqliteConnection,
    table: &str,
    id: &str,
    cols: &[String],
) -> std::collections::HashMap<cell_values::CellKey, Option<Vec<u8>>> {
    let granularity: String =
        sqlx::query_scalar("SELECT granularity FROM sync_registry WHERE tbl = ?1")
            .bind(table)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
    let keys: Vec<cell_values::CellKey> = cols
        .iter()
        .map(|col| (single_row_id(id), col.clone()))
        .collect();
    cell_values::read(conn, table, granularity.parse().unwrap(), &keys)
        .await
        .unwrap()
}

async fn get_cells(tx: &DbTransaction, table: &str, id: &str) -> Vec<(String, Option<Vec<u8>>)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let cols: Vec<String> =
        sqlx::query_scalar("SELECT col FROM sync_cells WHERE tbl = ?1 AND row_id = ?2")
            .bind(table)
            .bind(single_row_id(id))
            .fetch_all(&mut *conn)
            .await
            .unwrap();
    let mut values = cell_values_of(conn, table, id, &cols).await;
    cols.into_iter()
        .map(|col| {
            let value = values.remove(&(single_row_id(id), col.clone())).flatten();
            (col, value)
        })
        .collect()
}

/// A cell's value (as `get_cells`), HLC and the device id the HLC names.
async fn get_cell(
    tx: &DbTransaction,
    table: &str,
    id: &str,
    col: &str,
) -> Option<(Option<Vec<u8>>, String, String)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let hlc: Vec<u8> =
        sqlx::query_scalar("SELECT hlc FROM sync_cells WHERE tbl=?1 AND row_id=?2 AND col=?3")
            .bind(table)
            .bind(single_row_id(id))
            .bind(col)
            .fetch_optional(&mut *conn)
            .await
            .unwrap()?;
    let hlc = Hlc::from_bytes(&hlc).unwrap();
    let mut values = cell_values_of(conn, table, id, &[col.to_string()]).await;
    let value = values
        .remove(&(single_row_id(id), col.to_string()))
        .flatten();
    Some((value, hlc.format(), hlc.device_id.to_string()))
}

/// The device id `remote_cell`'s HLCs name.
fn remote_device_id() -> String {
    DeviceId::from_name("remote-device").to_string()
}

fn remote_cell(
    id: &str,
    col: &str,
    value: Option<Vec<u8>>,
    physical_ms: u64,
    counter: u32,
) -> CellChange {
    let hlc = Hlc::new(physical_ms, counter, DeviceId::from_name("remote-device"));
    CellChange {
        tbl: "notes".to_string(),
        row_id: single_row_id(id),
        col: col.to_string(),
        value,
        hlc: hlc.format(),
        device_id: "remote-device".to_string(),
    }
}

// --- register_table ---

#[tokio::test]
async fn register_table_missing_table_returns_table_not_found() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("does_not_exist", Granularity::Column, &[])
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::TableNotFound(_))));
}

#[tokio::test]
async fn register_table_integer_primary_key_succeeds() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE int_pk (id INTEGER PRIMARY KEY, name TEXT)")
            .execute(&mut *conn)
            .await
            .unwrap();
    }
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("int_pk", Granularity::Column, &[])
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
}

#[tokio::test]
async fn register_table_blob_primary_key_returns_invalid_primary_key() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE blob_pk (id BLOB PRIMARY KEY, name TEXT)")
            .execute(&mut *conn)
            .await
            .unwrap();
    }
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("blob_pk", Granularity::Column, &[])
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::InvalidPrimaryKey { .. })));
}

#[tokio::test]
async fn register_table_composite_text_primary_key_succeeds() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE composite (a TEXT, b TEXT, note TEXT, PRIMARY KEY (a, b))")
            .execute(&mut *conn)
            .await
            .unwrap();
    }
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("composite", Granularity::Column, &[])
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
}

#[tokio::test]
async fn register_table_composite_mixed_text_and_integer_primary_key_succeeds() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE composite (a TEXT, b INTEGER, note TEXT, PRIMARY KEY (a, b))")
            .execute(&mut *conn)
            .await
            .unwrap();
    }
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("composite", Granularity::Column, &[])
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
}

#[tokio::test]
async fn register_table_composite_primary_key_with_blob_column_returns_invalid_primary_key() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE composite (a TEXT, b BLOB, PRIMARY KEY (a, b))")
            .execute(&mut *conn)
            .await
            .unwrap();
    }
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table("composite", Granularity::Column, &[])
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::InvalidPrimaryKey { .. })));
}

#[tokio::test]
async fn register_table_same_granularity_twice_succeeds() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    let actual = engine
        .register_table("notes", Granularity::Column, &[])
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
}

#[tokio::test]
async fn register_table_conflicting_granularity_returns_granularity_mismatch() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    let actual = engine.register_table("notes", Granularity::Row, &[]).await;

    // Assert

    assert!(matches!(actual, Err(SyncError::GranularityMismatch { .. })));
}

#[tokio::test]
async fn register_table_column_mode_backfills_rows_that_existed_before_registration() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    insert_note(&tx, "1", "Title", "Body").await;
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(2, cells.len(), "{cells:?}");
    assert!(cells.iter().any(|(col, _)| col == "title"));
    assert!(cells.iter().any(|(col, _)| col == "body"));
}

#[tokio::test]
async fn register_table_row_mode_backfills_rows_that_existed_before_registration() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    insert_note(&tx, "1", "Title", "Body").await;
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    // Assert

    let cell = get_cell(&tx, "notes", "1", merge::ROW_COL).await;
    assert!(cell.is_some());
}

#[tokio::test]
async fn register_table_reregistration_does_not_touch_already_backfilled_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    insert_note(&tx, "1", "Title", "Body").await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    let before = get_cell(&tx, "notes", "1", "title").await;

    // Act

    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Assert

    let after = get_cell(&tx, "notes", "1", "title").await;
    assert_eq!(before, after);
}

// --- local tracking ---

#[tokio::test]
async fn column_mode_insert_writes_cell_per_column() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    insert_note(&tx, "1", "Title", "Body").await;

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(2, cells.len());
    assert!(cells.iter().any(|(col, _)| col == "title"));
    assert!(cells.iter().any(|(col, _)| col == "body"));
}

#[tokio::test]
async fn column_mode_update_writes_only_changed_columns() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let (_, body_hlc_before, _) = get_cell(&tx, "notes", "1", "body").await.unwrap();

    // Act

    update_note_title(&tx, "1", "New Title").await;

    // Assert

    let (title_value, _, _) = get_cell(&tx, "notes", "1", "title").await.unwrap();
    assert_eq!(Some(b"New Title".to_vec()), title_value);

    let (_, body_hlc_after, _) = get_cell(&tx, "notes", "1", "body").await.unwrap();
    assert_eq!(body_hlc_before, body_hlc_after);
}

#[tokio::test]
async fn column_mode_repeated_edits_coalesce_to_one_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;

    // Act

    update_note_title(&tx, "1", "A").await;
    update_note_title(&tx, "1", "B").await;

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(2, cells.len());
    let (title_value, _, _) = get_cell(&tx, "notes", "1", "title").await.unwrap();
    assert_eq!(Some(b"B".to_vec()), title_value);
}

#[tokio::test]
async fn column_mode_delete_writes_tombstone() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;

    // Act

    delete_note(&tx, "1").await;

    // Assert

    let (value, _, _) = get_cell(&tx, "notes", "1", merge::DELETED_COL)
        .await
        .unwrap();
    assert_eq!(None, value);
}

#[tokio::test]
async fn column_mode_delete_drops_the_rows_other_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;

    // Act

    delete_note(&tx, "1").await;

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(vec![(merge::DELETED_COL.to_string(), None)], cells);
}

#[tokio::test]
async fn row_mode_insert_writes_single_row_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    // Act

    insert_note(&tx, "1", "Title", "Body").await;

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(1, cells.len());
    assert_eq!(merge::ROW_COL, cells[0].0);
    let json: serde_json::Value = serde_json::from_slice(cells[0].1.as_ref().unwrap()).unwrap();
    assert_eq!("1", json["id"]);
    assert_eq!("Title", json["title"]);
    assert_eq!("Body", json["body"]);
}

// --- push / pull cursor ---

#[tokio::test]
async fn changes_since_last_push_excludes_foreign_device_and_already_pushed_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;

    let first_push = engine.changes_since_last_push().await.unwrap();
    let up_to = first_push
        .cells
        .iter()
        .map(|c| c.hlc.clone())
        .max()
        .unwrap();
    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    insert_note(&tx, "2", "Title2", "Body2").await;
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "3",
                    "title",
                    Some(b"Foreign".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert!(!actual.cells.is_empty());
    assert!(actual.cells.iter().all(|c| c.row_id == single_row_id("2")));
}

#[tokio::test]
async fn mark_pushed_advances_cursor() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let batch = engine.changes_since_last_push().await.unwrap();
    let up_to = batch.cells.iter().map(|c| c.hlc.clone()).max().unwrap();

    // Act

    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    // Assert

    let actual = engine.changes_since_last_push().await.unwrap();
    assert!(actual.cells.is_empty());
}

#[tokio::test]
async fn row_mode_insert_blob_value_returns_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    // Act

    let actual = {
        let mut guard = tx.lock().await;
        sqlx::query("INSERT INTO notes(id, title, body) VALUES ('1', X'00', 'Body')")
            .execute(guard.as_mut())
            .await
    };

    // Assert

    let message = actual.unwrap_err().to_string();
    assert!(message.contains("can't hold a BLOB value"), "{message}");
}

#[tokio::test]
async fn changes_since_last_push_unregistered_table_returns_unregistered_table() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    {
        let mut guard = tx.lock().await;
        sqlx::query("DELETE FROM sync_registry WHERE tbl = 'notes'")
            .execute(guard.as_mut())
            .await
            .unwrap();
    }

    // Act

    let actual = engine.changes_since_last_push().await;

    // Assert

    assert!(matches!(actual, Err(SyncError::UnregisteredTable(table)) if table == "notes"));
}

#[tokio::test]
async fn changes_since_last_push_cell_of_missing_column_is_dropped() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    {
        let mut guard = tx.lock().await;
        sqlx::query(
            "INSERT INTO sync_cells(tbl, row_id, col, hlc, is_remote)
             SELECT tbl, row_id, 'gone', hlc, 0 FROM sync_cells WHERE col = 'title'",
        )
        .execute(guard.as_mut())
        .await
        .unwrap();
    }

    // Act

    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    let mut cols: Vec<&str> = actual.cells.iter().map(|c| c.col.as_str()).collect();
    cols.sort_unstable();
    assert_eq!(vec!["body", "title"], cols);
    let remaining: Vec<String> = get_cells(&tx, "notes", "1")
        .await
        .into_iter()
        .map(|(col, _)| col)
        .collect();
    assert!(!remaining.contains(&"gone".to_string()));
}

#[tokio::test]
async fn changes_since_last_push_column_mode_reports_one_cell_per_column_with_correct_values() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    insert_note(&tx, "1", "Title", "Body").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(2, actual.cells.len());

    let title_cell = actual.cells.iter().find(|c| c.col == "title").unwrap();
    assert_eq!("notes", title_cell.tbl);
    assert_eq!(single_row_id("1"), title_cell.row_id);
    assert_eq!(Some(b"Title".to_vec()), title_cell.value);
    assert_eq!(local_device_id(&scope).await, title_cell.device_id);

    let body_cell = actual.cells.iter().find(|c| c.col == "body").unwrap();
    assert_eq!(Some(b"Body".to_vec()), body_cell.value);
}

#[tokio::test]
async fn changes_since_last_push_column_mode_update_reports_only_changed_column() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let first_push = engine.changes_since_last_push().await.unwrap();
    let up_to = first_push
        .cells
        .iter()
        .map(|c| c.hlc.clone())
        .max()
        .unwrap();
    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    // Act

    update_note_title(&tx, "1", "New Title").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    assert_eq!("title", actual.cells[0].col);
    assert_eq!(Some(b"New Title".to_vec()), actual.cells[0].value);
}

#[tokio::test]
async fn changes_since_last_push_column_mode_delete_reports_tombstone_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let first_push = engine.changes_since_last_push().await.unwrap();
    let up_to = first_push
        .cells
        .iter()
        .map(|c| c.hlc.clone())
        .max()
        .unwrap();
    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    // Act

    delete_note(&tx, "1").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    assert_eq!(merge::DELETED_COL, actual.cells[0].col);
    assert_eq!(None, actual.cells[0].value);
}

#[tokio::test]
async fn changes_since_last_push_row_mode_reports_single_row_cell_with_full_json_payload() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    // Act

    insert_note(&tx, "1", "Title", "Body").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    let cell = &actual.cells[0];
    assert_eq!("notes", cell.tbl);
    assert_eq!(single_row_id("1"), cell.row_id);
    assert_eq!(merge::ROW_COL, cell.col);

    let json: serde_json::Value = serde_json::from_slice(cell.value.as_ref().unwrap()).unwrap();
    assert_eq!("1", json["id"]);
    assert_eq!("Title", json["title"]);
    assert_eq!("Body", json["body"]);
}

#[tokio::test]
async fn changes_since_last_push_row_mode_update_reports_full_row_snapshot_again() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let first_push = engine.changes_since_last_push().await.unwrap();
    let up_to = first_push
        .cells
        .iter()
        .map(|c| c.hlc.clone())
        .max()
        .unwrap();
    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    // Act

    update_note_title(&tx, "1", "New Title").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    assert_eq!(merge::ROW_COL, actual.cells[0].col);
    let json: serde_json::Value =
        serde_json::from_slice(actual.cells[0].value.as_ref().unwrap()).unwrap();
    assert_eq!("New Title", json["title"]);
    assert_eq!("Body", json["body"]);
}

#[tokio::test]
async fn changes_since_last_push_row_mode_delete_reports_tombstone_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    let first_push = engine.changes_since_last_push().await.unwrap();
    let up_to = first_push
        .cells
        .iter()
        .map(|c| c.hlc.clone())
        .max()
        .unwrap();
    engine
        .mark_pushed(&Hlc::parse(&up_to).unwrap())
        .await
        .unwrap();

    // Act

    delete_note(&tx, "1").await;
    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    assert_eq!(merge::DELETED_COL, actual.cells[0].col);
    assert_eq!(None, actual.cells[0].value);
}

#[tokio::test]
async fn changes_since_last_push_row_mode_insert_then_delete_before_push_reports_only_tombstone() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    delete_note(&tx, "1").await;

    // Act

    let actual = engine.changes_since_last_push().await.unwrap();

    // Assert

    assert_eq!(1, actual.cells.len());
    assert_eq!(merge::DELETED_COL, actual.cells[0].col);
}

#[tokio::test]
async fn pull_cursor_roundtrip() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let engine = scope.resolve::<dyn SyncStore>().await;
    assert_eq!(None, engine.get_last_pulled_server_seq().await.unwrap());

    // Act

    engine.set_last_pulled_server_seq(42).await.unwrap();

    // Assert

    assert_eq!(Some(42), engine.get_last_pulled_server_seq().await.unwrap());
}

// --- apply_remote ---

#[tokio::test]
async fn apply_remote_newer_cell_updates_base_table() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    "title",
                    Some(b"Remote".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some("Remote".to_string()), get_note_title(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_older_cell_is_discarded_base_unchanged() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", "title", Some(b"Ancient".to_vec()), 1, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some("Local".to_string()), get_note_title(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_column_cell_for_missing_row_creates_skeleton() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "42",
                    "title",
                    Some(b"Hi".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some("Hi".to_string()), get_note_title(&tx, "42").await);
}

#[tokio::test]
async fn apply_remote_tombstone_deletes_base_row_and_persists() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;
    let far = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, far, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!note_exists(&tx, "1").await);
    let (_, hlc, _) = get_cell(&tx, "notes", "1", merge::DELETED_COL)
        .await
        .unwrap();
    assert_eq!(
        Hlc::new(far, 0, DeviceId::from_name("remote-device")).format(),
        hlc
    );
}

const KEEP_TITLE_GUARD: &str = "(SELECT title FROM notes WHERE id = ?1) = 'Keep'";

#[tokio::test]
async fn apply_remote_tombstone_guarded_row_keeps_row_and_restages_its_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    engine
        .set_delete_guard("notes", Some(KEEP_TITLE_GUARD))
        .await
        .unwrap();
    insert_note(&tx, "1", "Keep", "Body").await;
    let far = far_future_ms();
    let tombstone_hlc = Hlc::new(far, 0, DeviceId::from_name("remote-device")).format();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, far, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(note_exists(&tx, "1").await);
    assert!(
        get_cell(&tx, "notes", "1", merge::DELETED_COL)
            .await
            .is_none()
    );
    let local_device = local_device_id(&scope).await;
    for col in ["title", "body"] {
        let (_, hlc, device_id) = get_cell(&tx, "notes", "1", col).await.unwrap();
        assert!(hlc > tombstone_hlc, "{col} must outrank the tombstone");
        assert_eq!(device_id, local_device);
    }
}

#[tokio::test]
async fn apply_remote_tombstone_guard_not_met_deletes_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    engine
        .set_delete_guard("notes", Some(KEEP_TITLE_GUARD))
        .await
        .unwrap();
    insert_note(&tx, "1", "Other", "Body").await;

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    merge::DELETED_COL,
                    None,
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!note_exists(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_tombstone_guarded_row_restaged_cells_are_pushed() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    engine
        .set_delete_guard("notes", Some(KEEP_TITLE_GUARD))
        .await
        .unwrap();
    insert_note(&tx, "1", "Keep", "Body").await;
    let pushed = engine.changes_since_last_push().await.unwrap();
    let last_hlc = Hlc::parse(&pushed.cells.last().unwrap().hlc).unwrap();
    engine.mark_pushed(&last_hlc).await.unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    merge::DELETED_COL,
                    None,
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    let mut cols: Vec<String> = engine
        .changes_since_last_push()
        .await
        .unwrap()
        .cells
        .into_iter()
        .map(|cell| cell.col)
        .collect();
    cols.sort();
    assert_eq!(cols, vec!["body", "title"]);
}

#[tokio::test]
async fn apply_remote_stale_update_after_tombstone_is_discarded() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;
    let far = far_future_ms();

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, far, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    "title",
                    Some(b"TooLate".to_vec()),
                    far - 1,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!note_exists(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_higher_hlc_update_after_delete_resurrects_row() {
    // Arrange

    // A tombstone never clears when the row returns, so the update is judged against its HLC;
    // otherwise a reusable natural id could never come back once deleted.

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;
    let far = far_future_ms();

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, far, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    "title",
                    Some(b"Resurrected".to_vec()),
                    far,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some("Resurrected".to_string()),
        get_note_title(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_row_mode_upserts_whole_row_from_json() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "RBody"});
    let cell = remote_cell(
        "1",
        merge::ROW_COL,
        Some(serde_json::to_vec(&payload).unwrap()),
        far_future_ms(),
        0,
    );

    // Act

    engine
        .apply_remote(ChangeBatch { cells: vec![cell] }, true)
        .await
        .unwrap();

    // Assert

    assert_eq!(Some("Remote".to_string()), get_note_title(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_shape_mismatch_returns_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    merge::ROW_COL,
                    Some(b"{}".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::CellShapeMismatch { .. })));
}

#[tokio::test]
async fn apply_remote_shape_mismatch_rejects_whole_batch_fail_fast() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell("1", "title", Some(b"Remote".to_vec()), far_future_ms(), 0),
                    remote_cell(
                        "2",
                        merge::ROW_COL,
                        Some(b"{}".to_vec()),
                        far_future_ms(),
                        1,
                    ),
                ],
            },
            true,
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::CellShapeMismatch { .. })));
    // `SetColumn` cells only materialize in `apply_remote`'s final flush, which the second cell's
    // error aborts, so the base table never sees the first either.
    assert_eq!(None, get_note_title(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_malformed_row_payload_returns_invalid_row_payload_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    merge::ROW_COL,
                    Some(b"not json".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::InvalidRowPayload { .. })));
}

#[tokio::test]
async fn apply_remote_does_not_retrigger_local_sync_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell(
                    "1",
                    "title",
                    Some(b"Remote".to_vec()),
                    far_future_ms(),
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    let cells = get_cells(&tx, "notes", "1").await;
    assert_eq!(1, cells.len());
    let (_, _, device_id) = get_cell(&tx, "notes", "1", "title").await.unwrap();
    assert_eq!(remote_device_id(), device_id);
}

#[tokio::test]
async fn apply_remote_advances_local_clock_past_remote_hlc() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    let far = far_future_ms();
    let remote_hlc = Hlc::new(far, 42, DeviceId::from_name("remote-device"));

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", "title", Some(b"Remote".to_vec()), far, 42)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    let actual = scope
        .resolve::<DbPool>()
        .await
        .sync_clock()
        .await
        .get()
        .now();
    assert!(actual > remote_hlc);
}

// --- composite primary keys ---

async fn create_composite_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query(
        "CREATE TABLE composite_notes (workspace_id TEXT, id TEXT, title TEXT, PRIMARY KEY (workspace_id, id))",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
}

async fn insert_composite_note(tx: &DbTransaction, workspace_id: &str, id: &str, title: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("INSERT INTO composite_notes(workspace_id, id, title) VALUES (?1, ?2, ?3)")
        .bind(workspace_id)
        .bind(id)
        .bind(title)
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn get_composite_note_title(
    tx: &DbTransaction,
    workspace_id: &str,
    id: &str,
) -> Option<String> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("SELECT title FROM composite_notes WHERE workspace_id = ?1 AND id = ?2")
        .bind(workspace_id)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .map(|row| row.try_get("title").unwrap())
}

#[tokio::test]
async fn column_mode_composite_primary_key_insert_encodes_row_id_as_json_array_in_key_order() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_composite_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("composite_notes", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    insert_composite_note(&tx, "ws1", "1", "Title").await;

    // Assert

    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let row_id: String = sqlx::query_scalar(
        "SELECT row_id FROM sync_cells WHERE tbl = 'composite_notes' AND col = 'title'",
    )
    .fetch_one(&mut *conn)
    .await
    .unwrap();
    assert_eq!(row_id_json(&["ws1", "1"]), row_id);
}

#[tokio::test]
async fn apply_remote_composite_primary_key_updates_matching_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_composite_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("composite_notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_composite_note(&tx, "ws1", "1", "Local").await;
    insert_composite_note(&tx, "ws2", "1", "OtherWorkspaceLocal").await;

    let hlc = Hlc::new(far_future_ms(), 0, DeviceId::from_name("remote-device"));
    let cell = CellChange {
        tbl: "composite_notes".to_string(),
        row_id: row_id_json(&["ws1", "1"]),
        col: "title".to_string(),
        value: Some(b"Remote".to_vec()),
        hlc: hlc.format(),
        device_id: "remote-device".to_string(),
    };

    // Act

    engine
        .apply_remote(ChangeBatch { cells: vec![cell] }, true)
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some("Remote".to_string()),
        get_composite_note_title(&tx, "ws1", "1").await
    );
    assert_eq!(
        Some("OtherWorkspaceLocal".to_string()),
        get_composite_note_title(&tx, "ws2", "1").await
    );
}

#[tokio::test]
async fn apply_remote_row_mode_recreated_row_after_tombstone_reuses_same_composite_row_id() {
    // Arrange

    // A row-mode table with a natural composite key, so re-adding reuses the row id and is judged
    // against the tombstone's HLC (see `merge::decide`).

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_composite_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("composite_notes", Granularity::Row, &[])
        .await
        .unwrap();

    let first_seen = far_future_ms();
    let row_id = row_id_json(&["ws1", "1"]);

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![CellChange {
                    tbl: "composite_notes".to_string(),
                    row_id: row_id.clone(),
                    col: merge::ROW_COL.to_string(),
                    value: Some(
                        serde_json::to_vec(
                            &serde_json::json!({"workspace_id":"ws1","id":"1","title":"First"}),
                        )
                        .unwrap(),
                    ),
                    hlc: Hlc::new(first_seen, 0, DeviceId::from_name("remote-device")).format(),
                    device_id: "remote-device".to_string(),
                }],
            },
            true,
        )
        .await
        .unwrap();

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![CellChange {
                    tbl: "composite_notes".to_string(),
                    row_id: row_id.clone(),
                    col: merge::DELETED_COL.to_string(),
                    value: None,
                    hlc: Hlc::new(first_seen + 1, 0, DeviceId::from_name("remote-device")).format(),
                    device_id: "remote-device".to_string(),
                }],
            },
            true,
        )
        .await
        .unwrap();
    assert_eq!(None, get_composite_note_title(&tx, "ws1", "1").await);

    // Act

    let resurrection_ms = first_seen + 100_000;
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![CellChange {
                    tbl: "composite_notes".to_string(),
                    row_id: row_id.clone(),
                    col: merge::ROW_COL.to_string(),
                    value: Some(
                        serde_json::to_vec(
                            &serde_json::json!({"workspace_id":"ws1","id":"1","title":"Recreated"}),
                        )
                        .unwrap(),
                    ),
                    hlc: Hlc::new(resurrection_ms, 0, DeviceId::from_name("remote-device"))
                        .format(),
                    device_id: "remote-device".to_string(),
                }],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some("Recreated".to_string()),
        get_composite_note_title(&tx, "ws1", "1").await
    );
}

async fn create_int_component_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query(
        "CREATE TABLE splits (parent_id TEXT, seq INTEGER, content TEXT, PRIMARY KEY (parent_id, seq))",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
}

async fn insert_split(tx: &DbTransaction, parent_id: &str, seq: i64, content: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("INSERT INTO splits(parent_id, seq, content) VALUES (?1, ?2, ?3)")
        .bind(parent_id)
        .bind(seq)
        .bind(content)
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn get_split_content(tx: &DbTransaction, parent_id: &str, seq: i64) -> Option<String> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query_scalar("SELECT content FROM splits WHERE parent_id = ?1 AND seq = ?2")
        .bind(parent_id)
        .bind(seq)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
}

#[tokio::test]
async fn column_mode_integer_primary_key_component_insert_encodes_row_id_with_json_number() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_int_component_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("splits", Granularity::Column, &[])
        .await
        .unwrap();

    // Act

    insert_split(&tx, "asset1", 2, "chunk two").await;

    // Assert

    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let row_id: String = sqlx::query_scalar(
        "SELECT row_id FROM sync_cells WHERE tbl = 'splits' AND col = 'content'",
    )
    .fetch_one(&mut *conn)
    .await
    .unwrap();
    assert_eq!("[\"asset1\",2]", row_id);
}

#[tokio::test]
async fn apply_remote_integer_primary_key_component_updates_matching_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_int_component_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("splits", Granularity::Column, &[])
        .await
        .unwrap();
    insert_split(&tx, "asset1", 2, "Local").await;
    insert_split(&tx, "asset1", 3, "OtherSeqLocal").await;

    let hlc = Hlc::new(far_future_ms(), 0, DeviceId::from_name("remote-device"));
    let cell = CellChange {
        tbl: "splits".to_string(),
        row_id: "[\"asset1\",2]".to_string(),
        col: "content".to_string(),
        value: Some(b"Remote".to_vec()),
        hlc: hlc.format(),
        device_id: "remote-device".to_string(),
    };

    // Act

    engine
        .apply_remote(ChangeBatch { cells: vec![cell] }, true)
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some("Remote".to_string()),
        get_split_content(&tx, "asset1", 2).await
    );
    assert_eq!(
        Some("OtherSeqLocal".to_string()),
        get_split_content(&tx, "asset1", 3).await
    );
}

// --- column-mode row materialization (NOT NULL grouping / pending buffer) ---

async fn create_required_notes_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query(
        "CREATE TABLE required_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT)",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
}

async fn get_required_note(tx: &DbTransaction, id: &str) -> Option<(String, Option<String>)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("SELECT title, body FROM required_notes WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .map(|row| (row.try_get("title").unwrap(), row.try_get("body").unwrap()))
}

fn remote_cell_for(
    tbl: &str,
    id: &str,
    col: &str,
    value: Option<Vec<u8>>,
    physical_ms: u64,
    counter: u32,
) -> CellChange {
    let hlc = Hlc::new(physical_ms, counter, DeviceId::from_name("remote-device"));
    CellChange {
        tbl: tbl.to_string(),
        row_id: single_row_id(id),
        col: col.to_string(),
        value,
        hlc: hlc.format(),
        device_id: "remote-device".to_string(),
    }
}

#[tokio::test]
async fn apply_remote_new_row_not_null_column_arrives_with_other_cells_in_same_batch_succeeds() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell_for("required_notes", "1", "title", Some(b"Hi".to_vec()), ms, 0),
                    remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 1),
                ],
            },
            true,
        )
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
    assert_eq!(
        Some(("Hi".to_string(), Some("Body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_column_update_on_existing_row_leaves_untouched_not_null_column_intact() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell_for("required_notes", "1", "title", Some(b"Hi".to_vec()), ms, 0),
                    remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 1),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    // Only `body` is in this batch; `title` (NOT NULL) is untouched, as in a real
    // update on an already-materialized row.
    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "body",
                    Some(b"New body".to_vec()),
                    ms,
                    2,
                )],
            },
            true,
        )
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
    assert_eq!(
        Some(("Hi".to_string(), Some("New body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_page_new_row_with_its_required_columns_writes_it_and_a_later_page_completes_it()
 {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "title",
                    Some(b"Hi".to_vec()),
                    ms,
                    0,
                )],
            },
            false,
        )
        .await
        .unwrap();
    let after_first_page = get_required_note(&tx, "1").await;

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "body",
                    Some(b"Body".to_vec()),
                    ms,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some(("Hi".to_string(), None)), after_first_page);
    assert_eq!(
        Some(("Hi".to_string(), Some("Body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_page_delete_on_later_page_drops_pending_columns_for_that_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", "title", Some(b"Hi".to_vec()), ms, 0)],
            },
            false,
        )
        .await
        .unwrap();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, ms, 1)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!note_exists(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_partial_edit_after_tombstone_discards_it_without_leaving_the_row_pending() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // `title` lands, then a tombstone deletes the row and drops its cells.
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "title",
                    Some(b"Hi".to_vec()),
                    ms,
                    0,
                )],
            },
            false,
        )
        .await
        .unwrap();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    merge::DELETED_COL,
                    None,
                    ms,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    // A later cycle carries only an edit to `body`, which can't rebuild the row.
    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "body",
                    Some(b"Body".to_vec()),
                    ms,
                    2,
                )],
            },
            true,
        )
        .await;

    // Assert

    assert!(actual.is_ok(), "{actual:?}");
    assert_eq!(None, get_required_note(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_reinsert_split_across_syncs_after_tombstone_restores_every_column() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    merge::DELETED_COL,
                    None,
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // The re-insert's first push chunk lands in one sync, the second in the next.
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "body",
                    Some(b"Body".to_vec()),
                    ms,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "title",
                    Some(b"Hi".to_vec()),
                    ms,
                    2,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some(("Hi".to_string(), Some("Body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_tombstone_after_partial_row_in_earlier_sync_forgets_its_stored_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    "body",
                    Some(b"Body".to_vec()),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();
    assert_eq!(1, pending_cells(&tx).await.len());

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell_for(
                    "required_notes",
                    "1",
                    merge::DELETED_COL,
                    None,
                    ms,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(pending_cells(&tx).await.is_empty());
    assert_eq!(None, get_required_note(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_tombstone_drops_older_cells_but_keeps_newer_ones() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell("1", "title", Some(b"Old".to_vec()), ms, 0),
                    remote_cell("1", "body", Some(b"New".to_vec()), ms, 2),
                    remote_cell("1", merge::DELETED_COL, None, ms, 1),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    let mut cells = get_cells(&tx, "notes", "1").await;
    cells.sort();
    assert_eq!(
        vec![
            (merge::DELETED_COL.to_string(), None),
            ("body".to_string(), Some(b"New".to_vec())),
        ],
        cells
    );
}

#[tokio::test]
async fn apply_remote_tombstone_arriving_after_newer_cells_keeps_row_they_resurrect() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;
    let ms = far_future_ms();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", "title", Some(b"New".to_vec()), ms, 1)],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, ms, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some((Some("New".to_string()), None)),
        get_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_row_mode_tombstone_after_newer_row_in_same_page_keeps_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    let row = serde_json::json!({ "id": "1", "title": "New", "body": "Body" });

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell(
                        "1",
                        merge::ROW_COL,
                        Some(serde_json::to_vec(&row).unwrap()),
                        ms,
                        1,
                    ),
                    remote_cell("1", merge::DELETED_COL, None, ms, 0),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some("New".to_string()), get_note_title(&tx, "1").await);
}

#[tokio::test]
async fn apply_remote_guarded_tombstone_followed_by_newer_cells_in_same_page_keeps_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    engine
        .set_delete_guard("notes", Some(KEEP_TITLE_GUARD))
        .await
        .unwrap();
    insert_note(&tx, "1", "Other", "Body").await;
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell("1", merge::DELETED_COL, None, ms, 0),
                    remote_cell("1", "title", Some(b"New".to_vec()), ms, 1),
                    remote_cell("1", "body", Some(b"New body".to_vec()), ms, 1),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some((Some("New".to_string()), Some("New body".to_string()))),
        get_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_cell_older_than_tombstone_is_not_kept_in_sync_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", merge::DELETED_COL, None, ms, 1)],
            },
            true,
        )
        .await
        .unwrap();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![remote_cell("1", "title", Some(b"Stale".to_vec()), ms, 0)],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        vec![(merge::DELETED_COL.to_string(), None)],
        get_cells(&tx, "notes", "1").await
    );
}

// --- FK repair ---

async fn create_parents_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT)")
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn insert_parent(tx: &DbTransaction, id: &str) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("INSERT INTO parents(id, name) VALUES (?1, 'Parent')")
        .bind(id)
        .execute(&mut *conn)
        .await
        .unwrap();
}

/// No SQL `FOREIGN KEY` to `parents` — an implicit reference enforced only
/// through a configured `FkConstraint` (e.g. a self-referencing parent id).
async fn create_children_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT)")
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn create_children_notnull_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("CREATE TABLE children_notnull (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL)")
        .execute(&mut *conn)
        .await
        .unwrap();
}

/// A real SQL `FOREIGN KEY` to `parents`, for the fallback discard pass on a
/// column with no configured `FkConstraint`.
async fn create_children_fk_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query(
        "CREATE TABLE children_fk (id TEXT PRIMARY KEY, parent_id TEXT, \
         FOREIGN KEY (parent_id) REFERENCES parents(id))",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
}

/// Implicit reference to `children.id`, so discarding an orphaned child can
/// cascade into discarding a grandchild on a later fixpoint iteration.
async fn create_grandchildren_table(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("CREATE TABLE grandchildren (id TEXT PRIMARY KEY, child_id TEXT)")
        .execute(&mut *conn)
        .await
        .unwrap();
}

/// Statement-time FK enforcement would otherwise reject a row referencing a
/// not-yet-pulled parent — the same deferral `DefaultSyncEngine::sync` arms.
async fn defer_foreign_keys(tx: &DbTransaction) {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query("PRAGMA defer_foreign_keys = ON")
        .execute(&mut *conn)
        .await
        .unwrap();
}

async fn child_parent_id(tx: &DbTransaction, table: &str, id: &str) -> Option<Option<String>> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let sql = format!("SELECT parent_id FROM {table} WHERE id = ?1");
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .map(|row| row.try_get("parent_id").unwrap())
}

/// Marks `id` in `parents` as deleted, which FK repair requires before discarding its children.
async fn insert_parent_tombstone(tx: &DbTransaction, id: &str) {
    let mut guard = tx.lock().await;
    sqlx::query(
        "INSERT INTO sync_cells(tbl, row_id, col, hlc, is_remote)
         VALUES ('parents', json_array(?1), ?2, hlc_now(), 0)",
    )
    .bind(id)
    .bind(merge::DELETED_COL)
    .execute(guard.as_mut())
    .await
    .unwrap();
}

async fn child_exists(tx: &DbTransaction, table: &str, id: &str) -> bool {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let sql = format!("SELECT 1 FROM {table} WHERE id = ?1");
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .unwrap()
        .is_some()
}

fn row_cell(
    tbl: &str,
    id: &str,
    payload: serde_json::Value,
    physical_ms: u64,
    counter: u32,
) -> CellChange {
    remote_cell_for(
        tbl,
        id,
        merge::ROW_COL,
        Some(serde_json::to_vec(&payload).unwrap()),
        physical_ms,
        counter,
    )
}

#[tokio::test]
async fn register_table_set_null_policy_on_not_null_column_returns_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_children_notnull_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table(
            "children_notnull",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::SetNull,
            )],
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::InvalidFkPolicy { .. })));
}

#[tokio::test]
async fn register_table_unknown_fk_column_returns_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "bogus_column",
                "parents",
                "id",
                FkPolicy::SetNull,
            )],
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::UnknownColumn { .. })));
}

#[tokio::test]
async fn register_table_reregistration_replaces_fk_policies() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::SetNull,
            )],
        )
        .await
        .unwrap();

    // Act

    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();

    // Assert

    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let policies: Vec<String> = sqlx::query_scalar(
        "SELECT policy FROM sync_fk_policies WHERE tbl = 'children' AND col = 'parent_id'",
    )
    .fetch_all(&mut *conn)
    .await
    .unwrap();
    assert_eq!(vec!["discard_row".to_string()], policies);
}

#[tokio::test]
async fn apply_remote_last_page_missing_parent_set_null_policy_nulls_fk_column() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::SetNull,
            )],
        )
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(Some(None), child_parent_id(&tx, "children", "c1").await);
}

#[tokio::test]
async fn apply_remote_last_page_missing_parent_set_default_policy_writes_default_value() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    insert_parent(&tx, "fallback-parent").await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::SetDefault("fallback-parent".to_string()),
            )],
        )
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some(Some("fallback-parent".to_string())),
        child_parent_id(&tx, "children", "c1").await
    );
}

#[tokio::test]
async fn apply_remote_last_page_missing_parent_discard_policy_deletes_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    insert_parent_tombstone(&tx, "missing-parent").await;
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!child_exists(&tx, "children", "c1").await);
}

#[tokio::test]
async fn apply_remote_last_page_absent_parent_without_tombstone_keeps_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "not-arrived-yet"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(child_exists(&tx, "children", "c1").await);
    assert!(
        get_cell(&tx, "children", "c1", merge::DELETED_COL)
            .await
            .is_none()
    );
}

fn schema_version_cell(version: i64, ms: u64) -> CellChange {
    let mut cell = row_cell(
        "device_schema_versions",
        "other-device",
        serde_json::json!({"device_id": "other-device", "version": version}),
        ms,
        0,
    );
    cell.device_id = "other-device".to_string();
    cell
}

async fn latest_migration(tx: &DbTransaction) -> i64 {
    let mut guard = tx.lock().await;
    sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(guard.as_mut())
        .await
        .unwrap()
}

#[tokio::test]
async fn apply_remote_newer_schema_version_refuses_whole_page() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("device_schema_versions", Granularity::Row, &[])
        .await
        .unwrap();
    engine
        .register_table("children", Granularity::Row, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    let newer = latest_migration(&tx).await + 1;

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    row_cell(
                        "children",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": null}),
                        ms,
                        1,
                    ),
                    schema_version_cell(newer, ms),
                ],
            },
            true,
        )
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::AppUpdateRequired { .. })));
    assert!(!child_exists(&tx, "children", "c1").await);
}

#[tokio::test]
async fn apply_remote_unreadable_schema_version_refuses_page() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("device_schema_versions", Granularity::Row, &[])
        .await
        .unwrap();
    let mut cell = schema_version_cell(1, far_future_ms());
    cell.value = Some(br#"{"device_id":"other-device","version":"unknown"}"#.to_vec());

    // Act

    let actual = engine
        .apply_remote(ChangeBatch { cells: vec![cell] }, true)
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::AppUpdateRequired { .. })));
}

#[tokio::test]
async fn apply_remote_same_schema_version_applies_page() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("device_schema_versions", Granularity::Row, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    let same = latest_migration(&tx).await;

    // Act

    let actual = engine
        .apply_remote(
            ChangeBatch {
                cells: vec![schema_version_cell(same, ms)],
            },
            true,
        )
        .await;

    // Assert

    assert!(actual.is_ok());
}

#[tokio::test]
async fn record_local_schema_version_called_twice_stages_one_unchanged_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("device_schema_versions", Granularity::Row, &[])
        .await
        .unwrap();
    engine.record_local_schema_version().await.unwrap();
    let staged = engine.changes_since_last_push().await.unwrap().cells;

    // Act

    engine.record_local_schema_version().await.unwrap();

    // Assert

    let actual = engine.changes_since_last_push().await.unwrap().cells;
    assert_eq!(1, actual.len());
    assert_eq!(staged[0].hlc, actual[0].hlc);
    let row: serde_json::Value = serde_json::from_slice(actual[0].value.as_ref().unwrap()).unwrap();
    assert_eq!(
        latest_migration(&tx).await,
        row["version"].as_i64().unwrap()
    );
}

#[tokio::test]
async fn apply_remote_parent_on_later_page_does_not_repair_child() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("parents", Granularity::Row, &[])
        .await
        .unwrap();
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "p1"}),
                    ms,
                    0,
                )],
            },
            false,
        )
        .await
        .unwrap();
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "parents",
                    "p1",
                    serde_json::json!({"id": "p1", "name": "Parent"}),
                    ms,
                    1,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some(Some("p1".to_string())),
        child_parent_id(&tx, "children", "c1").await
    );
}

#[tokio::test]
async fn apply_remote_last_page_unconfigured_declared_fk_violation_discards_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_fk_table(&tx).await;
    defer_foreign_keys(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("children_fk", Granularity::Row, &[])
        .await
        .unwrap();
    insert_parent_tombstone(&tx, "missing-parent").await;
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children_fk",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!child_exists(&tx, "children_fk", "c1").await);
}

#[tokio::test]
async fn apply_remote_last_page_discarded_parent_cascades_repair_to_grandchild() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    create_grandchildren_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    engine
        .register_table(
            "grandchildren",
            Granularity::Row,
            &[FkConstraint::new(
                "child_id",
                "children",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    insert_parent_tombstone(&tx, "missing-parent").await;
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    row_cell(
                        "children",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                        ms,
                        0,
                    ),
                    row_cell(
                        "grandchildren",
                        "g1",
                        serde_json::json!({"id": "g1", "child_id": "c1"}),
                        ms,
                        1,
                    ),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(!child_exists(&tx, "children", "c1").await);
    assert!(!child_exists(&tx, "grandchildren", "g1").await);
}

#[tokio::test]
async fn apply_remote_last_page_repair_records_local_tombstone_in_sync_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table(
            "children",
            Granularity::Row,
            &[FkConstraint::new(
                "parent_id",
                "parents",
                "id",
                FkPolicy::DiscardRow,
            )],
        )
        .await
        .unwrap();
    insert_parent_tombstone(&tx, "missing-parent").await;
    let ms = far_future_ms();

    // Act

    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    ms,
                    0,
                )],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    let (_, _, device_id) = get_cell(&tx, "children", "c1", merge::DELETED_COL)
        .await
        .unwrap();
    assert_ne!(remote_device_id(), device_id);
}

#[tokio::test]
async fn apply_remote_last_page_with_unmaterialized_row_skips_foreign_key_repair() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_parents_table(&tx).await;
    create_children_fk_table(&tx).await;
    create_required_notes_table(&tx).await;
    defer_foreign_keys(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("parents", Granularity::Row, &[])
        .await
        .unwrap();
    engine
        .register_table("children_fk", Granularity::Row, &[])
        .await
        .unwrap();
    engine
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();

    // Act

    // Row 1 can never be materialized: its NOT NULL `title` is in neither the batch nor the cell log,
    // so local state is knowingly incomplete when the last page lands.
    engine
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 0),
                    row_cell(
                        "children_fk",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                        ms,
                        1,
                    ),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert!(
        child_exists(&tx, "children_fk", "c1").await,
        "FK repair must not discard rows while any row is still unmaterialized"
    );
    assert!(
        !get_cells(&tx, "children_fk", "c1")
            .await
            .iter()
            .any(|(col, _)| col == merge::DELETED_COL),
        "no deletion should be staged for pushing to other devices"
    );
}

#[tokio::test]
async fn is_row_deleted_after_local_delete_returns_true() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    delete_note(&tx, "1").await;

    // Act

    let actual = store.is_row_deleted("notes", "1").await.unwrap();

    // Assert

    assert!(actual);
}

#[tokio::test]
async fn is_row_deleted_live_or_unknown_row_returns_false() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;

    // Act

    let live = store.is_row_deleted("notes", "1").await.unwrap();
    let unknown = store.is_row_deleted("notes", "2").await.unwrap();

    // Assert

    assert!(!live);
    assert!(!unknown);
}

#[tokio::test]
async fn deleted_rows_row_added_again_after_its_delete_returns_none() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    delete_note(&tx, "1").await;
    insert_note(&tx, "1", "Title", "Body").await;

    // Act

    let deleted = store
        .deleted_rows("notes", &["1".to_string()])
        .await
        .unwrap();
    let is_deleted = store.is_row_deleted("notes", "1").await.unwrap();

    // Assert

    assert!(deleted.is_empty());
    assert!(!is_deleted);
}

#[tokio::test]
async fn deleted_rows_mixed_keys_returns_only_deleted_ones() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    insert_note(&tx, "2", "Title", "Body").await;
    delete_note(&tx, "1").await;
    let keys = ["1", "2", "3"].map(String::from);

    // Act

    let actual = store.deleted_rows("notes", &keys).await.unwrap();

    // Assert

    assert_eq!(std::collections::HashSet::from(["1".to_string()]), actual);
}

// Multi-device sync: devices run the real `DefaultSyncEngine` against `FakeServer`, an in-memory
// stand-in for amber-backend.

#[tokio::test]
async fn take_staged_more_staged_than_limit_returns_oldest_in_pull_order() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let ms = far_future_ms();
    let cells: Vec<CellChange> = (0..5)
        .map(|i| remote_cell(&i.to_string(), "title", None, ms, i))
        .collect();
    store
        .stage_remote(ChangeBatch {
            cells: cells[..3].to_vec(),
        })
        .await
        .unwrap();
    store
        .stage_remote(ChangeBatch {
            cells: cells[3..].to_vec(),
        })
        .await
        .unwrap();

    // Act

    let first = store.take_staged(4).await.unwrap();
    let rest = store.take_staged(4).await.unwrap();

    // Assert

    assert_eq!(cells[..4].to_vec(), first.cells);
    assert_eq!(cells[4..].to_vec(), rest.cells);
    assert!(!store.has_staged().await.unwrap());
}

#[tokio::test]
async fn take_staged_limit_inside_a_rows_cells_takes_the_rest_of_that_row() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let ms = far_future_ms();
    let cells = vec![
        remote_cell("1", "title", None, ms, 0),
        remote_cell("2", "title", None, ms, 1),
        remote_cell("2", "body", None, ms, 2),
        remote_cell("2", "extra", None, ms, 3),
        remote_cell("3", "title", None, ms, 4),
    ];
    store
        .stage_remote(ChangeBatch {
            cells: cells.clone(),
        })
        .await
        .unwrap();

    // Act

    let first = store.take_staged(2).await.unwrap();
    let rest = store.take_staged(2).await.unwrap();

    // Assert

    assert_eq!(cells[..4].to_vec(), first.cells);
    assert_eq!(cells[4..].to_vec(), rest.cells);
}

#[tokio::test]
async fn take_staged_rows_cells_staged_far_apart_takes_them_together() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let ms = far_future_ms();
    let cells = vec![
        remote_cell("1", "title", None, ms, 0),
        remote_cell("2", "title", None, ms, 1),
        remote_cell("3", "title", None, ms, 2),
        remote_cell("1", "body", None, ms, 3),
    ];
    store
        .stage_remote(ChangeBatch {
            cells: cells.clone(),
        })
        .await
        .unwrap();

    // Act

    let first = store.take_staged(1).await.unwrap();
    let rest = store.take_staged(10).await.unwrap();

    // Assert

    assert_eq!(vec![cells[0].clone(), cells[3].clone()], first.cells);
    assert_eq!(cells[1..3].to_vec(), rest.cells);
}

#[tokio::test]
async fn apply_remote_new_column_row_in_a_committed_earlier_batch_is_written_before_a_crash() {
    // Arrange

    let injector = create_file_backed_test_injector().await;
    let setup = injector.start_scope();
    create_notes_table(&*setup.resolve::<DbTransaction>().await).await;
    setup
        .resolve::<dyn SyncStore>()
        .await
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    setup.save_changes().await.unwrap();
    let ms = far_future_ms();
    let batch = ChangeBatch {
        cells: vec![
            remote_cell("1", "title", Some(b"Title".to_vec()), ms, 0),
            remote_cell("1", "body", Some(b"Body".to_vec()), ms, 1),
        ],
    };

    // Act

    {
        // Not the last batch, and the sync stops after its commit, as a quit or crash would leave it.
        let scope = injector.start_scope();
        scope
            .resolve::<dyn SyncStore>()
            .await
            .apply_remote(batch, false)
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
    }

    // Assert

    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    assert_eq!(
        Some((Some("Title".to_string()), Some("Body".to_string()))),
        get_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_incomplete_row_lost_from_the_buffer_by_a_crash_is_rebuilt_when_the_rest_arrives()
 {
    // Arrange

    let injector = create_file_backed_test_injector().await;
    let setup = injector.start_scope();
    create_required_notes_table(&*setup.resolve::<DbTransaction>().await).await;
    setup
        .resolve::<dyn SyncStore>()
        .await
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    setup.save_changes().await.unwrap();
    let ms = far_future_ms();
    {
        // The required title hasn't arrived, so the row stays buffered when this batch commits.
        let scope = injector.start_scope();
        let body = remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 0);
        scope
            .resolve::<dyn SyncStore>()
            .await
            .apply_remote(ChangeBatch { cells: vec![body] }, false)
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
    }

    // Act

    let scope = injector.start_scope();
    let title = remote_cell_for("required_notes", "1", "title", Some(b"Hi".to_vec()), ms, 1);
    scope
        .resolve::<dyn SyncStore>()
        .await
        .apply_remote(ChangeBatch { cells: vec![title] }, true)
        .await
        .unwrap();

    // Assert

    let tx = scope.resolve::<DbTransaction>().await;
    assert_eq!(
        Some(("Hi".to_string(), Some("Body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn take_staged_transaction_rolled_back_keeps_cells_staged() {
    // Arrange

    let injector = create_file_backed_test_injector().await;
    let setup_scope = injector.start_scope();
    let setup_store = setup_scope.resolve::<dyn SyncStore>().await;
    setup_store
        .stage_remote(ChangeBatch {
            cells: vec![remote_cell("1", "title", None, far_future_ms(), 0)],
        })
        .await
        .unwrap();
    setup_scope.save_changes().await.unwrap();

    // Act

    {
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        store.take_staged(10).await.unwrap();
    }

    // Assert

    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    assert!(store.has_staged().await.unwrap());
}

#[tokio::test]
async fn stage_remote_page_from_newer_schema_stages_nothing() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    let newer = latest_migration(&tx).await + 1;
    let store = scope.resolve::<dyn SyncStore>().await;
    let ms = far_future_ms();

    // Act

    let actual = store
        .stage_remote(ChangeBatch {
            cells: vec![
                remote_cell("1", "title", None, ms, 0),
                schema_version_cell(newer, ms),
            ],
        })
        .await;

    // Assert

    assert!(matches!(actual, Err(SyncError::AppUpdateRequired { .. })));
    assert!(!store.has_staged().await.unwrap());
}

#[tokio::test]
async fn stage_remote_malformed_hlc_stages_nothing() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let mut malformed = remote_cell("2", "title", None, far_future_ms(), 1);
    malformed.hlc = "not-an-hlc".to_string();

    // Act

    let actual = store
        .stage_remote(ChangeBatch {
            cells: vec![
                remote_cell("1", "title", None, far_future_ms(), 0),
                malformed,
            ],
        })
        .await;

    // Assert

    assert!(actual.is_err());
    assert!(!store.has_staged().await.unwrap());
}

#[tokio::test]
async fn stage_remote_page_advances_clock_past_its_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let staged = remote_cell("1", "title", None, far_future_ms(), 0);

    // Act

    store
        .stage_remote(ChangeBatch {
            cells: vec![staged.clone()],
        })
        .await
        .unwrap();

    // Assert

    let clock = scope.resolve::<DbPool>().await.sync_clock().await;
    assert!(clock.get().now() > Hlc::parse(&staged.hlc).unwrap());
}

mod multi_device {
    use std::collections::{HashMap, HashSet};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use injector::injector::Injector;
    use injector::register_scope;

    use super::{
        create_notes_table, delete_note, get_note, insert_note, single_row_id, update_note_title,
    };
    use crate::backend::clients::amber_backend_client::{
        AmberBackendClient, AmberBackendClientError, MockAmberBackendClient,
    };
    use crate::generated_code::{CellChange, ChangeBatch, PullResponse};
    use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
    use crate::infrastructure::value_objects::db_transaction::DbTransaction;
    use crate::sync::engine::SyncEngine;
    use crate::sync::errors::SyncError;
    use crate::sync::implementations::default_sync_engine::DefaultSyncEngine;
    use crate::sync::store::SyncStore;
    use crate::sync::utils::merge;
    use crate::sync::value_objects::granularity::Granularity;
    use crate::test_utils::create_file_backed_test_injector;

    /// Small, so a few rows already span several pull pages.
    const PAGE_SIZE: usize = 3;

    #[derive(Default)]
    struct ServerState {
        cells: HashMap<(String, String, String), (CellChange, i64)>,
        last_seq: i64,
        /// Successful pulls left before one fails, as a dropped connection would.
        pulls_before_failure: Option<usize>,
    }

    /// The backend's rules: LWW per cell by HLC, a tombstone drops the row's older cells, and
    /// every stored write takes the next server seq, which pulls page through.
    #[derive(Default)]
    struct FakeServer {
        state: Mutex<ServerState>,
        latency: Mutex<Duration>,
    }

    impl FakeServer {
        fn push(&self, batch: ChangeBatch) {
            std::thread::sleep(*self.latency.lock().unwrap());
            let mut state = self.state.lock().unwrap();
            let mut cells = batch.cells;
            cells.sort_by_key(|cell| cell.col != merge::DELETED_COL);
            for cell in cells {
                let key = (cell.tbl.clone(), cell.row_id.clone(), cell.col.clone());
                if state
                    .cells
                    .get(&key)
                    .is_some_and(|(stored, _)| stored.hlc >= cell.hlc)
                {
                    continue;
                }
                let tombstone_key = (
                    cell.tbl.clone(),
                    cell.row_id.clone(),
                    merge::DELETED_COL.to_string(),
                );
                if cell.col == merge::DELETED_COL {
                    state.cells.retain(|(tbl, row_id, col), (stored, _)| {
                        !(tbl == &cell.tbl
                            && row_id == &cell.row_id
                            && col != merge::DELETED_COL
                            && stored.hlc < cell.hlc)
                    });
                } else if state
                    .cells
                    .get(&tombstone_key)
                    .is_some_and(|(tombstone, _)| tombstone.hlc >= cell.hlc)
                {
                    continue;
                }
                state.last_seq += 1;
                let seq = state.last_seq;
                state.cells.insert(key, (cell, seq));
            }
        }

        fn pull(&self, since: Option<i64>) -> Result<PullResponse, AmberBackendClientError> {
            std::thread::sleep(*self.latency.lock().unwrap());
            let mut state = self.state.lock().unwrap();
            match state.pulls_before_failure {
                Some(0) => {
                    state.pulls_before_failure = None;
                    return Err(AmberBackendClientError::Unauthorized);
                }
                Some(left) => state.pulls_before_failure = Some(left - 1),
                None => {}
            }
            let since = since.unwrap_or(0);
            let mut page: Vec<&(CellChange, i64)> = state
                .cells
                .values()
                .filter(|(_, seq)| *seq > since)
                .collect();
            page.sort_by_key(|(_, seq)| *seq);
            page.truncate(PAGE_SIZE);
            Ok(PullResponse {
                next_server_seq: page.last().map_or(since, |(_, seq)| *seq),
                has_more: page.len() == PAGE_SIZE,
                cells: page.into_iter().map(|(cell, _)| cell.clone()).collect(),
            })
        }

        fn set_latency(&self, latency: Duration) {
            *self.latency.lock().unwrap() = latency;
        }

        fn fail_pull_after(&self, successful_pulls: usize) {
            self.state.lock().unwrap().pulls_before_failure = Some(successful_pulls);
        }
    }

    /// One install with its own database and device id, syncing through `server`.
    struct Device {
        injector: Injector,
    }

    impl Device {
        async fn new(server: &Arc<FakeServer>) -> Self {
            let mut client = MockAmberBackendClient::new();
            let pushing = server.clone();
            client.expect_push_changes().returning(move |batch| {
                pushing.push(batch);
                Ok(())
            });
            let pulling = server.clone();
            client
                .expect_pull_changes()
                .returning(move |since| pulling.pull(since));

            let mut injector = create_file_backed_test_injector().await;
            injector.register_singleton::<dyn AmberBackendClient>(Arc::new(client));
            register_scope!(injector, dyn SyncEngine, DefaultSyncEngine);

            let device = Self { injector };
            device.commit(async |tx| create_notes_table(tx).await).await;
            let scope = device.injector.start_scope();
            scope
                .resolve::<dyn SyncStore>()
                .await
                .register_table("notes", Granularity::Column, &[])
                .await
                .unwrap();
            scope.save_changes().await.unwrap();
            device
        }

        async fn try_sync(&self) -> Result<(), SyncError> {
            let scope = self.injector.start_scope();
            scope.resolve::<dyn SyncEngine>().await.sync().await?;
            scope.save_changes().await.unwrap();
            Ok(())
        }

        async fn sync(&self) {
            self.try_sync().await.unwrap()
        }

        /// Runs `write` in its own scope and commits it, as a Tauri command does.
        async fn commit(&self, write: impl AsyncFnOnce(&DbTransaction)) {
            let scope = self.injector.start_scope();
            write(&*scope.resolve::<DbTransaction>().await).await;
            scope.save_changes().await.unwrap();
        }

        async fn insert(&self, id: &str, title: &str, body: &str) {
            self.commit(async |tx| insert_note(tx, id, title, body).await)
                .await;
        }

        async fn set_title(&self, id: &str, title: &str) {
            self.commit(async |tx| update_note_title(tx, id, title).await)
                .await;
        }

        async fn set_body(&self, id: &str, body: &str) {
            self.commit(async |tx| {
                let mut guard = tx.lock().await;
                sqlx::query("UPDATE notes SET body = ?1 WHERE id = ?2")
                    .bind(body)
                    .bind(id)
                    .execute(guard.as_mut())
                    .await
                    .unwrap();
            })
            .await;
        }

        async fn delete(&self, id: &str) {
            self.commit(async |tx| delete_note(tx, id).await).await;
        }

        async fn note(&self, id: &str) -> Option<(String, String)> {
            let scope = self.injector.start_scope();
            let tx = scope.resolve::<DbTransaction>().await;
            get_note(&tx, id)
                .await
                .map(|(title, body)| (title.unwrap(), body.unwrap()))
        }

        async fn pending_row_ids(&self) -> HashSet<String> {
            let scope = self.injector.start_scope();
            let batch = scope
                .resolve::<dyn SyncStore>()
                .await
                .changes_since_last_push()
                .await
                .unwrap();
            batch.cells.into_iter().map(|cell| cell.row_id).collect()
        }
    }

    fn note(title: &str, body: &str) -> Option<(String, String)> {
        Some((title.to_string(), body.to_string()))
    }

    #[tokio::test]
    async fn sync_note_created_on_one_device_reaches_the_other() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        let b = Device::new(&server).await;
        a.insert("1", "Title", "Body").await;

        // Act

        a.sync().await;
        b.sync().await;

        // Assert

        assert_eq!(note("Title", "Body"), b.note("1").await);
    }

    #[tokio::test]
    async fn sync_offline_edits_to_different_columns_both_survive_and_same_column_later_wins() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        let b = Device::new(&server).await;
        a.insert("1", "Original", "Original").await;
        a.sync().await;
        b.sync().await;
        a.set_title("1", "Title from A").await;
        a.set_body("1", "Body from A").await;
        tokio::time::sleep(Duration::from_millis(5)).await;
        b.set_body("1", "Body from B").await;

        // Act

        a.sync().await;
        b.sync().await;
        a.sync().await;

        // Assert

        assert_eq!(note("Title from A", "Body from B"), a.note("1").await);
        assert_eq!(note("Title from A", "Body from B"), b.note("1").await);
    }

    #[tokio::test]
    async fn sync_rows_split_across_pull_pages_all_materialize() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        let ids: Vec<String> = (0..7).map(|i| format!("paged-{i}")).collect();
        for id in &ids {
            a.insert(id, &format!("Title {id}"), &format!("Body {id}"))
                .await;
        }
        a.sync().await;
        let b = Device::new(&server).await;

        // Act

        b.sync().await;

        // Assert

        for id in &ids {
            assert_eq!(
                note(&format!("Title {id}"), &format!("Body {id}")),
                b.note(id).await
            );
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn sync_edits_during_a_running_sync_succeed_win_and_reach_the_other_device() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        let b = Arc::new(Device::new(&server).await);
        a.insert("1", "Original", "Body").await;
        a.sync().await;
        b.sync().await;
        for i in 0..10 {
            a.insert(&format!("bulk-{i}"), "Bulk", "Bulk").await;
        }
        a.set_title("1", "Older edit from A").await;
        a.sync().await;
        server.set_latency(Duration::from_millis(30));

        let edits = async {
            for i in 0..10 {
                tokio::time::sleep(Duration::from_millis(20)).await;
                b.insert(&format!("during-{i}"), "During", "Body").await;
            }
            b.set_title("1", "Newer edit from B").await;
        };

        // Act

        // Spawned, as the server's blocking latency would otherwise stall the edits in this task too.
        let syncing = tokio::spawn({
            let b = b.clone();
            async move { b.sync().await }
        });
        edits.await;
        syncing.await.unwrap();
        server.set_latency(Duration::ZERO);
        b.sync().await;
        a.sync().await;

        // Assert

        assert_eq!(note("Newer edit from B", "Body"), a.note("1").await);
        assert_eq!(note("Newer edit from B", "Body"), b.note("1").await);
        for i in 0..10 {
            assert_eq!(note("During", "Body"), a.note(&format!("during-{i}")).await);
        }
        assert!(b.pending_row_ids().await.is_empty());
    }

    #[tokio::test]
    async fn sync_delete_on_one_device_removes_the_row_on_the_other() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        let b = Device::new(&server).await;
        a.insert("1", "Title", "Body").await;
        a.sync().await;
        b.sync().await;
        a.delete("1").await;

        // Act

        a.sync().await;
        b.sync().await;

        // Assert

        assert_eq!(None, b.note("1").await);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn sync_simultaneous_syncs_from_two_devices_both_reach_a_third() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Arc::new(Device::new(&server).await);
        let b = Arc::new(Device::new(&server).await);
        let c = Arc::new(Device::new(&server).await);
        for i in 0..10 {
            a.insert(&format!("a-{i}"), "A", "A").await;
            b.insert(&format!("b-{i}"), "B", "B").await;
        }
        server.set_latency(Duration::from_millis(10));

        // Act

        let syncs = [&a, &b, &c].map(|device| {
            let device = device.clone();
            tokio::spawn(async move { device.sync().await })
        });
        for sync in syncs {
            sync.await.unwrap();
        }
        c.sync().await;

        // Assert

        for i in 0..10 {
            assert_eq!(note("A", "A"), c.note(&format!("a-{i}")).await);
            assert_eq!(note("B", "B"), c.note(&format!("b-{i}")).await);
        }
    }

    #[tokio::test]
    async fn sync_after_a_pull_failed_midway_resumes_and_converges() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        for i in 0..7 {
            a.insert(&format!("{i}"), "Title", "Body").await;
        }
        a.sync().await;
        let b = Device::new(&server).await;
        b.insert("local", "Local", "Body").await;
        server.fail_pull_after(1);

        // Act

        let failed = b.try_sync().await;
        let b_after_failure = b.note("0").await;
        b.sync().await;
        a.sync().await;

        // Assert

        assert!(failed.is_err());
        assert_eq!(note("Title", "Body"), b_after_failure);
        for i in 0..7 {
            assert_eq!(note("Title", "Body"), b.note(&format!("{i}")).await);
        }
        assert_eq!(note("Local", "Body"), a.note("local").await);
        assert!(!b.pending_row_ids().await.contains(&single_row_id("local")));
    }

    #[tokio::test]
    async fn sync_stopped_between_apply_batches_resumes_and_converges() {
        // Arrange

        let server = Arc::new(FakeServer::default());
        let a = Device::new(&server).await;
        for i in 0..7 {
            a.insert(&format!("{i}"), "Title", "Body").await;
        }
        a.sync().await;
        // Rewritten cells move to the end of the pull, away from the rest of their row.
        a.set_title("0", "Edited").await;
        a.set_title("3", "Edited").await;
        a.sync().await;
        let b = Device::new(&server).await;
        {
            let scope = b.injector.start_scope();
            let store = scope.resolve::<dyn SyncStore>().await;
            let mut since = None;
            loop {
                let page = server.pull(since).unwrap();
                store
                    .stage_remote(ChangeBatch { cells: page.cells })
                    .await
                    .unwrap();
                store
                    .set_last_pulled_server_seq(page.next_server_seq)
                    .await
                    .unwrap();
                since = Some(page.next_server_seq);
                if !page.has_more {
                    break;
                }
            }
            scope.save_changes().await.unwrap();
        }

        // Act

        for _ in 0..2 {
            // Each batch commits, then the sync stops, as a quit or crash between batches would leave it.
            let scope = b.injector.start_scope();
            let store = scope.resolve::<dyn SyncStore>().await;
            let batch = store.take_staged(2).await.unwrap();
            store.apply_remote(batch, false).await.unwrap();
            scope.save_changes().await.unwrap();
        }
        let after_crash = b.note("0").await;
        b.sync().await;

        // Assert

        assert_eq!(note("Edited", "Body"), after_crash);
        for i in 0..7 {
            let title = if i == 0 || i == 3 { "Edited" } else { "Title" };
            assert_eq!(note(title, "Body"), b.note(&format!("{i}")).await);
        }
    }
}

mod live_backend;

async fn pending_cells(tx: &DbTransaction) -> Vec<(String, String, Option<Vec<u8>>)> {
    let mut guard = tx.lock().await;
    sqlx::query_as("SELECT tbl, col, value FROM sync_pending_cells ORDER BY tbl, row_id, col")
        .fetch_all(guard.as_mut())
        .await
        .unwrap()
}

#[tokio::test]
async fn apply_remote_newer_cell_and_older_tombstone_in_one_page_keeps_the_newer_value() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Local", "Body").await;
    let ms = far_future_ms();

    // Act

    store
        .apply_remote(
            ChangeBatch {
                cells: vec![
                    remote_cell("1", "title", Some(b"New".to_vec()), ms, 2),
                    remote_cell("1", merge::DELETED_COL, None, ms, 1),
                ],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(
        Some((Some("New".to_string()), None)),
        get_note(&tx, "1").await
    );
}

#[tokio::test]
async fn apply_remote_incomplete_row_stores_its_cells_until_it_is_written() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    let body = remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 0);
    store
        .apply_remote(ChangeBatch { cells: vec![body] }, true)
        .await
        .unwrap();
    let stored_while_incomplete = pending_cells(&tx).await;

    // Act

    let title = remote_cell_for("required_notes", "1", "title", Some(b"Hi".to_vec()), ms, 1);
    store
        .apply_remote(ChangeBatch { cells: vec![title] }, true)
        .await
        .unwrap();

    // Assert

    assert_eq!(
        vec![(
            "required_notes".to_string(),
            "body".to_string(),
            Some(b"Body".to_vec())
        )],
        stored_while_incomplete
    );
    assert!(pending_cells(&tx).await.is_empty());
    assert_eq!(
        Some(("Hi".to_string(), Some("Body".to_string()))),
        get_required_note(&tx, "1").await
    );
}

#[tokio::test]
async fn read_row_not_in_its_table_returns_its_stored_values() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    let ms = far_future_ms();
    let body = remote_cell_for("required_notes", "1", "body", Some(b"Body".to_vec()), ms, 0);
    store
        .apply_remote(ChangeBatch { cells: vec![body] }, true)
        .await
        .unwrap();

    // Act

    let actual = get_cells(&tx, "required_notes", "1").await;

    // Assert

    assert_eq!(vec![("body".to_string(), Some(b"Body".to_vec()))], actual);
}

#[tokio::test]
async fn changes_since_last_push_row_mode_edit_sends_the_rows_current_json() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Row, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Old", "Body").await;
    {
        let mut guard = tx.lock().await;
        sqlx::query("UPDATE notes SET title = 'New' WHERE id = '1'")
            .execute(guard.as_mut())
            .await
            .unwrap();
    }

    // Act

    let actual = store.changes_since_last_push().await.unwrap();

    // Assert

    let values: Vec<(String, Option<Vec<u8>>)> = actual
        .cells
        .into_iter()
        .map(|cell| (cell.col, cell.value))
        .collect();
    assert_eq!(
        vec![(
            merge::ROW_COL.to_string(),
            Some(br#"{"id":"1","title":"New","body":"Body"}"#.to_vec())
        )],
        values
    );
}

#[tokio::test]
async fn changes_since_last_push_row_gone_without_tombstone_skips_and_drops_its_cells() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("notes", Granularity::Column, &[])
        .await
        .unwrap();
    insert_note(&tx, "1", "Title", "Body").await;
    insert_note(&tx, "2", "Kept", "Body").await;
    {
        // As a cascade during an apply does, with the triggers off.
        let mut guard = tx.lock().await;
        for sql in [
            "INSERT INTO sync_applying(x) VALUES (1)",
            "DELETE FROM notes WHERE id = '1'",
            "DELETE FROM sync_applying",
        ] {
            sqlx::query(sql).execute(guard.as_mut()).await.unwrap();
        }
    }

    // Act

    let actual = store.changes_since_last_push().await.unwrap();

    // Assert

    let mut pushed: Vec<(String, String)> = actual
        .cells
        .into_iter()
        .map(|cell| (cell.row_id, cell.col))
        .collect();
    pushed.sort();
    assert_eq!(
        vec![
            (single_row_id("2"), "body".to_string()),
            (single_row_id("2"), "title".to_string()),
        ],
        pushed
    );
    assert!(get_cells(&tx, "notes", "1").await.is_empty());
}

#[tokio::test]
async fn apply_remote_row_cascaded_away_then_newer_cell_and_its_tombstone_keeps_it_deleted() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let store = scope.resolve::<dyn SyncStore>().await;
    store
        .register_table("required_notes", Granularity::Column, &[])
        .await
        .unwrap();
    {
        // Written locally, then deleted by a cascade during an apply, with the triggers off.
        let mut guard = tx.lock().await;
        for sql in [
            "INSERT INTO required_notes(id, title, body) VALUES ('1', 'Title', 'Body')",
            "INSERT INTO sync_applying(x) VALUES (1)",
            "DELETE FROM required_notes WHERE id = '1'",
            "DELETE FROM sync_applying",
        ] {
            sqlx::query(sql).execute(guard.as_mut()).await.unwrap();
        }
    }
    let ms = far_future_ms();
    let newer = remote_cell_for("required_notes", "1", "body", Some(b"New".to_vec()), ms, 2);
    let tombstone = remote_cell_for("required_notes", "1", merge::DELETED_COL, None, ms, 1);
    store
        .apply_remote(ChangeBatch { cells: vec![newer] }, false)
        .await
        .unwrap();

    // Act

    store
        .apply_remote(
            ChangeBatch {
                cells: vec![tombstone],
            },
            true,
        )
        .await
        .unwrap();

    // Assert

    assert_eq!(None, get_required_note(&tx, "1").await);
    assert_eq!(
        vec![(
            "required_notes".to_string(),
            "body".to_string(),
            Some(b"New".to_vec())
        )],
        pending_cells(&tx).await
    );
}

#[tokio::test]
async fn register_table_row_mode_blob_column_returns_error() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    {
        let mut guard = tx.lock().await;
        sqlx::query("CREATE TABLE files (id TEXT PRIMARY KEY, data BLOB)")
            .execute(guard.as_mut())
            .await
            .unwrap();
    }
    let store = scope.resolve::<dyn SyncStore>().await;

    // Act

    let actual = store.register_table("files", Granularity::Row, &[]).await;

    // Assert

    assert!(matches!(
        actual,
        Err(SyncError::BlobColumnInRowMode { table, col }) if table == "files" && col == "data"
    ));
}
