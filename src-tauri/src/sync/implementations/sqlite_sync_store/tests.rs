use sqlx::Row;

use crate::generated_code::{CellChange, ChangeBatch};
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::sync::errors::SyncError;
use crate::sync::hlc::{DeviceId, Hlc};
use crate::sync::sql_functions;
use crate::sync::store::SyncStore;
use crate::sync::utils::merge;
use crate::sync::value_objects::granularity::Granularity;
use crate::test_utils::create_test_injector;

/// `SYNC_CLOCK`/`DEVICE_ID` are process-wide statics shared by every test in
/// this binary (see the module docs), so a fixed "far future" constant can
/// collide with the clock's live position once enough parallel tests have
/// advanced it via `observe()`. Deriving the value from the clock's current
/// tip instead guarantees it's always ahead of anything written so far.
fn far_future_ms() -> u64 {
    sql_functions::sync_clock().now().physical_ms + 100_000_000_000
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

/// `sync_cells.row_id` is a JSON array of the primary key column values, in
/// key order (see `trigger_sql::row_id_expr`) — for every table in this file's
/// tests, that's a single-element array holding the `notes.id` value.
fn row_id_json(values: &[&str]) -> String {
    serde_json::to_string(values).unwrap()
}

fn single_row_id(id: &str) -> String {
    row_id_json(&[id])
}

async fn get_cells(tx: &DbTransaction, table: &str, id: &str) -> Vec<(String, Option<Vec<u8>>)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    let rows = sqlx::query("SELECT col, value FROM sync_cells WHERE tbl = ?1 AND row_id = ?2")
        .bind(table)
        .bind(single_row_id(id))
        .fetch_all(&mut *conn)
        .await
        .unwrap();
    rows.into_iter()
        .map(|row| (row.try_get("col").unwrap(), row.try_get("value").unwrap()))
        .collect()
}

async fn get_cell(
    tx: &DbTransaction,
    table: &str,
    id: &str,
    col: &str,
) -> Option<(Option<Vec<u8>>, String, String)> {
    let mut guard = tx.lock().await;
    let conn = guard.as_mut();
    sqlx::query(
        "SELECT value, hlc, device_id FROM sync_cells WHERE tbl=?1 AND row_id=?2 AND col=?3",
    )
    .bind(table)
    .bind(single_row_id(id))
    .bind(col)
    .fetch_optional(&mut *conn)
    .await
    .unwrap()
    .map(|row| {
        (
            row.try_get("value").unwrap(),
            row.try_get("hlc").unwrap(),
            row.try_get("device_id").unwrap(),
        )
    })
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
        .register_table("does_not_exist", Granularity::Column)
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

    let actual = engine.register_table("int_pk", Granularity::Column).await;

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

    let actual = engine.register_table("blob_pk", Granularity::Column).await;

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
        .register_table("composite", Granularity::Column)
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
        .register_table("composite", Granularity::Column)
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
        .register_table("composite", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
        .await
        .unwrap();

    // Act

    let actual = engine.register_table("notes", Granularity::Column).await;

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
        .register_table("notes", Granularity::Column)
        .await
        .unwrap();

    // Act

    let actual = engine.register_table("notes", Granularity::Row).await;

    // Assert

    assert!(matches!(actual, Err(SyncError::GranularityMismatch { .. })));
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
async fn row_mode_insert_writes_single_row_cell() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
async fn changes_since_last_push_column_mode_reports_one_cell_per_column_with_correct_values() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column)
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
    assert_eq!(sql_functions::device_id().to_string(), title_cell.device_id);

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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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

#[tokio::test]
async fn apply_remote_stale_update_after_tombstone_is_discarded() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column)
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
async fn apply_remote_higher_hlc_update_after_delete_stays_deleted() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("notes", Granularity::Column)
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

    assert_eq!(None, get_note_title(&tx, "1").await);
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
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Column)
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
        .register_table("notes", Granularity::Column)
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
    // Column-mode `SetColumn` cells are buffered and only materialized into
    // the base table by the batch-level flush at the end of `apply_remote`;
    // the second cell's shape error aborts before that flush runs, so the
    // first (valid) cell's `sync_cells` bookkeeping won, but its effect never
    // reached the base table. Atomicity across the whole call is still the
    // caller's job (rolling back the surrounding transaction), per the
    // `apply_remote` contract.
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
        .register_table("notes", Granularity::Row)
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
        .register_table("notes", Granularity::Column)
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
    assert_eq!("remote-device", device_id);
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
        .register_table("notes", Granularity::Column)
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

    let actual = sql_functions::sync_clock().now();
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
        .register_table("composite_notes", Granularity::Column)
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
        .register_table("composite_notes", Granularity::Column)
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
        .register_table("splits", Granularity::Column)
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
        .register_table("splits", Granularity::Column)
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
        .register_table("required_notes", Granularity::Column)
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
async fn apply_remote_page_buffers_new_row_until_last_page_then_materializes_it() {
    // Arrange

    let injector = create_test_injector().await;
    let scope = injector.start_scope();
    let tx = scope.resolve::<DbTransaction>().await;
    create_required_notes_table(&tx).await;
    let engine = scope.resolve::<dyn SyncStore>().await;
    engine
        .register_table("required_notes", Granularity::Column)
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

    assert_eq!(None, after_first_page);
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
        .register_table("notes", Granularity::Column)
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
