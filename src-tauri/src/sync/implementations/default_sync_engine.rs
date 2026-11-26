use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use prost::Message;

use crate::backend::clients::amber_backend_client::AmberBackendClient;
use crate::database::database_connection_manager::DatabaseConnectionManager;
use crate::database::transaction_manager::TransactionManager;
use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::engine::SyncEngine;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::post_sync_tasks::PostSyncTasks;
use crate::sync::store::SyncStore;
use crate::sync::sync_lock::SyncLock;
use crate::sync::value_objects::sync_outcome::SyncOutcome;

/// Caps a single push request's wire size; the backend rejects larger payloads.
const MAX_PUSH_BATCH_BYTES: usize = 30 * 1024 * 1024;

/// Staged cells applied per transaction: small enough that an app write waits a fraction of a second.
const APPLY_BATCH_CELLS: usize = 2_000;

const LARGE_CURSOR_JUMP: i64 = 100_000;

#[derive(ScopeInjectable)]
pub struct DefaultSyncEngine {
    store: Arc<dyn SyncStore>,
    backend_client: Arc<dyn AmberBackendClient>,
    connection_manager: Arc<dyn DatabaseConnectionManager>,
    transaction_manager: Arc<dyn TransactionManager>,
    sync_lock: Arc<SyncLock>,
    post_sync_tasks: Arc<PostSyncTasks>,
}

#[async_trait]
impl SyncEngine for DefaultSyncEngine {
    async fn sync(&self) -> Result<SyncOutcome, SyncError> {
        // Serializes overlapping cycles: a child pushed before its parent would trip FK repair into
        // deleting the "orphaned" child everywhere.
        let _guard = self.sync_lock.0.lock().await;

        let result = self.sync_inner().await;

        // Must always run, but must not shadow a real `sync_inner` failure.
        if let Err(err) = self
            .connection_manager
            .enable_foreign_key_constraint_for_current_transaction()
            .await
        {
            if result.is_ok() {
                return Err(err.into());
            }
            log::error!("Failed to re-enable foreign key enforcement after sync: {err:?}");
        }

        result
    }
}

impl DefaultSyncEngine {
    /// Its transactions are short, commit before any network call and write before they read, so the
    /// app's own writes go on during a sync and neither side fails on a stale snapshot.
    async fn sync_inner(&self) -> Result<SyncOutcome, SyncError> {
        // Pull first so the server doesn't echo back what we're about to push. What a failed pull staged
        // is applied too, as each page was refused or staged whole.
        let pulled = self.pull().await;
        let mut outcome = SyncOutcome::new();
        let applied = self.apply_staged(&mut outcome).await;
        if let Err(err) = pulled {
            // The pull's error tells the user what to do (update the app, go online), so it wins.
            if let Err(apply_err) = async {
                applied?;
                self.commit().await
            }
            .await
            {
                log::error!(
                    "Failed to apply what was pulled before the pull failed: {apply_err:?}"
                );
            }
            return Err(err);
        }
        applied?;

        // Still under the last applied batch's lock, which these need to read and write safely.
        self.run_post_sync_tasks().await?;
        let batch = self.store.changes_since_last_push().await?;
        self.commit().await?;

        for chunk in Self::chunk_by_size(batch.cells, MAX_PUSH_BATCH_BYTES) {
            let up_to_hlc = chunk.last().map(|cell| Hlc::parse(&cell.hlc)).transpose()?;
            let Some(up_to_hlc) = up_to_hlc else {
                continue;
            };
            self.backend_client
                .push_changes(ChangeBatch { cells: chunk })
                .await?;
            // Later local writes stamp higher HLCs, so moving the cursor here never skips one.
            self.store.mark_pushed(&up_to_hlc).await?;
            self.commit().await?;
        }

        Ok(outcome)
    }

    /// Stages every page, committing each with the cursor, so a restart resumes where the pull stopped.
    async fn pull(&self) -> Result<(), SyncError> {
        let mut since_server_seq = self.store.get_last_pulled_server_seq().await?;
        log::info!("Resuming sync pull from server seq {since_server_seq:?}");
        self.commit().await?;

        loop {
            let page = self.backend_client.pull_changes(since_server_seq).await?;
            if !page.cells.is_empty() {
                self.store
                    .stage_remote(ChangeBatch { cells: page.cells })
                    .await?;
            }
            // Nothing re-pulls history the backend compacted past this cursor, so make a big jump visible.
            if let Some(previous) = since_server_seq
                && page.next_server_seq - previous > LARGE_CURSOR_JUMP
            {
                log::warn!(
                    "Sync cursor is jumping from server seq {previous} to {}",
                    page.next_server_seq
                );
            }
            self.store
                .set_last_pulled_server_seq(page.next_server_seq)
                .await?;
            self.commit().await?;
            since_server_seq = Some(page.next_server_seq);

            if !page.has_more {
                return Ok(());
            }
        }
    }

    /// Applies the staged cells in batches, committing each but the last, so the app's writes get in
    /// between. Runs even with nothing staged, as the last batch repairs foreign keys.
    async fn apply_staged(&self, outcome: &mut SyncOutcome) -> Result<(), SyncError> {
        loop {
            let batch = self.store.take_staged(APPLY_BATCH_CELLS).await?;
            let is_last_batch = !self.store.has_staged().await?;
            let row_ids: Vec<String> = batch.cells.iter().map(|c| c.row_id.clone()).collect();
            self.store.apply_remote(batch, is_last_batch).await?;
            outcome.record(row_ids);

            if is_last_batch {
                return Ok(());
            }
            self.commit().await?;
        }
    }

    /// Commits and reopens the transaction, deferring FK checks again. Enforcing them first lets a row
    /// still waiting for its parent commit, as turning deferral off forgets its violation.
    async fn commit(&self) -> Result<(), SyncError> {
        self.connection_manager
            .enable_foreign_key_constraint_for_current_transaction()
            .await?;
        self.transaction_manager.save_changes().await?;
        self.connection_manager
            .disable_foreign_key_constraint_for_current_transaction()
            .await?;

        Ok(())
    }

    /// Groups cells into batches under `max_bytes`, in order; a single cell over the cap ships alone
    /// rather than being dropped or split.
    fn chunk_by_size(cells: Vec<CellChange>, max_bytes: usize) -> Vec<Vec<CellChange>> {
        let mut chunks = Vec::new();
        let mut current = Vec::new();
        let mut current_bytes = 0usize;

        for cell in cells {
            let cell_bytes = cell.encoded_len();
            if !current.is_empty() && current_bytes + cell_bytes > max_bytes {
                chunks.push(std::mem::take(&mut current));
                current_bytes = 0;
            }
            current_bytes += cell_bytes;
            current.push(cell);
        }

        if !current.is_empty() {
            chunks.push(current);
        }

        chunks
    }

    async fn run_post_sync_tasks(&self) -> Result<(), SyncError> {
        for task in self.post_sync_tasks.iter() {
            log::debug!("Running post-sync task '{}'", task.name());
            task.run().await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use injector::injector::Injector;
    use injector::register_scope;
    use mockall::Sequence;
    use sqlx::Row;

    use std::sync::Mutex;

    use crate::backend::clients::amber_backend_client::{
        AmberBackendClientError, MockAmberBackendClient,
    };
    use crate::generated_code::{CellChange, PullResponse};
    use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
    use crate::infrastructure::value_objects::db_transaction::DbTransaction;
    use crate::sync::hlc::DeviceId;
    use crate::sync::post_sync_task::MockPostSyncTask;
    use crate::sync::utils::merge;
    use crate::sync::value_objects::fk_constraint::FkConstraint;
    use crate::sync::value_objects::fk_policy::FkPolicy;
    use crate::sync::value_objects::granularity::Granularity;
    use crate::test_utils::create_file_backed_test_injector;

    use super::*;

    /// Far enough ahead of wall time that a remote cell stamped with it always
    /// wins the last-writer-wins merge against anything the local clock issues.
    fn far_future_ms() -> u64 {
        crate::sync::hlc::wall_time_ms() + 100_000_000_000
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

    fn single_row_id(id: &str) -> String {
        serde_json::to_string(&[id]).unwrap()
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

    async fn initialize_test_injector(backend_client: MockAmberBackendClient) -> Injector {
        let mut injector = create_file_backed_test_injector().await;
        injector.register_singleton::<dyn AmberBackendClient>(Arc::new(backend_client));
        register_scope!(injector, DefaultSyncEngine);
        injector
    }

    #[tokio::test]
    async fn sync_no_local_changes_does_not_push() {
        // Arrange

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 0,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act & Assert

        engine.sync().await.unwrap();
    }

    #[tokio::test]
    async fn sync_pulls_remote_changes_before_pushing_local_changes() {
        // Arrange

        let mut sequence = Sequence::new();
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| {
                Ok(PullResponse {
                    cells: vec![],
                    next_server_seq: 0,
                    has_more: false,
                })
            });
        backend_client
            .expect_push_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        insert_note(&tx, "1", "Local", "Body").await;
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act & Assert

        engine.sync().await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn sync_overlapping_calls_never_run_pull_push_cycles_concurrently() {
        // Arrange

        let concurrent_calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let max_observed_concurrency = Arc::new(std::sync::atomic::AtomicUsize::new(0));

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning({
            let concurrent_calls = concurrent_calls.clone();
            let max_observed_concurrency = max_observed_concurrency.clone();
            move |_| {
                let now = concurrent_calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                max_observed_concurrency.fetch_max(now, std::sync::atomic::Ordering::SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(20));
                concurrent_calls.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);

                Ok(PullResponse {
                    cells: vec![],
                    next_server_seq: 0,
                    has_more: false,
                })
            }
        });
        backend_client.expect_push_changes().returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;

        let scope_a = injector.start_scope();
        let engine_a = scope_a.resolve::<DefaultSyncEngine>().await;
        let scope_b = injector.start_scope();
        let engine_b = scope_b.resolve::<DefaultSyncEngine>().await;

        // Act

        let (result_a, result_b) = tokio::join!(engine_a.sync(), engine_b.sync());

        // Assert

        result_a.unwrap();
        result_b.unwrap();
        assert_eq!(
            1,
            max_observed_concurrency.load(std::sync::atomic::Ordering::SeqCst),
            "two overlapping sync() calls must never run their pull/push cycles concurrently"
        );
    }

    #[tokio::test]
    async fn sync_applies_pulled_remote_changes_to_local_store() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "RBody"});
        let value = Some(serde_json::to_vec(&payload).unwrap());

        let mut backend_client = MockAmberBackendClient::new();
        // Computed lazily: the sync clock only exists once the injector (and so
        // the sqlite pool) is set up.
        backend_client.expect_pull_changes().returning(move |_| {
            let cell = remote_cell("1", merge::ROW_COL, value.clone(), far_future_ms(), 0);
            Ok(PullResponse {
                cells: vec![cell],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        engine.sync().await.unwrap();

        // Assert

        assert_eq!(Some("Remote".to_string()), get_note_title(&tx, "1").await);
    }

    #[tokio::test]
    async fn sync_pulled_remote_changes_returns_their_row_ids() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "RBody"});
        let value = Some(serde_json::to_vec(&payload).unwrap());
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(move |_| {
            let cell = remote_cell("1", merge::ROW_COL, value.clone(), far_future_ms(), 0);
            Ok(PullResponse {
                cells: vec![cell],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().never();
        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        let actual = engine.sync().await.unwrap();

        // Assert

        assert_eq!(
            Some(std::collections::HashSet::from([single_row_id("1")])),
            actual.changed_row_ids
        );
    }

    async fn create_parents_table(tx: &DbTransaction) {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT)")
            .execute(&mut *conn)
            .await
            .unwrap();
    }

    async fn create_children_table(tx: &DbTransaction) {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT)")
            .execute(&mut *conn)
            .await
            .unwrap();
    }

    async fn child_parent_id(tx: &DbTransaction, id: &str) -> Option<Option<String>> {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("SELECT parent_id FROM children WHERE id = ?1")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await
            .unwrap()
            .map(|row| row.try_get("parent_id").unwrap())
    }

    async fn child_exists(tx: &DbTransaction, id: &str) -> bool {
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query("SELECT 1 FROM children WHERE id = ?1")
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
        let hlc = Hlc::new(physical_ms, counter, DeviceId::from_name("remote-device"));
        CellChange {
            tbl: tbl.to_string(),
            row_id: single_row_id(id),
            col: merge::ROW_COL.to_string(),
            value: Some(serde_json::to_vec(&payload).unwrap()),
            hlc: hlc.format(),
            device_id: "remote-device".to_string(),
        }
    }

    #[tokio::test]
    async fn sync_child_page_before_parent_page_keeps_child_once_parent_arrives() {
        // Arrange

        let mut sequence = Sequence::new();
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| {
                Ok(PullResponse {
                    cells: vec![row_cell(
                        "children",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": "p1"}),
                        far_future_ms(),
                        0,
                    )],
                    next_server_seq: 1,
                    has_more: true,
                })
            });
        backend_client
            .expect_pull_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| {
                Ok(PullResponse {
                    cells: vec![row_cell(
                        "parents",
                        "p1",
                        serde_json::json!({"id": "p1", "name": "Parent"}),
                        far_future_ms(),
                        1,
                    )],
                    next_server_seq: 2,
                    has_more: false,
                })
            });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_parents_table(&tx).await;
        create_children_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("parents", Granularity::Row, &[])
            .await
            .unwrap();
        store
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
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        engine.sync().await.unwrap();

        // Assert

        assert_eq!(
            Some(Some("p1".to_string())),
            child_parent_id(&tx, "c1").await
        );
    }

    #[tokio::test]
    async fn sync_cells_staged_before_a_restart_applies_them_without_pulling_them_again() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "Body"});
        let staged = remote_cell(
            "1",
            merge::ROW_COL,
            Some(serde_json::to_vec(&payload).unwrap()),
            far_future_ms(),
            0,
        );
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .withf(|since| *since == Some(5))
            .times(1)
            .returning(|_| {
                Ok(PullResponse {
                    cells: vec![],
                    next_server_seq: 5,
                    has_more: false,
                })
            });
        backend_client.expect_push_changes().returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        create_notes_table(&setup_tx).await;
        let setup_store = setup_scope.resolve::<dyn SyncStore>().await;
        setup_store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        setup_store
            .stage_remote(ChangeBatch {
                cells: vec![staged],
            })
            .await
            .unwrap();
        setup_store.set_last_pulled_server_seq(5).await.unwrap();
        setup_scope.save_changes().await.unwrap();

        // Act

        let scope = injector.start_scope();
        scope
            .resolve::<DefaultSyncEngine>()
            .await
            .sync()
            .await
            .unwrap();
        scope.save_changes().await.unwrap();

        // Assert

        let tx = scope.resolve::<DbTransaction>().await;
        assert_eq!(Some("Remote".to_string()), get_note_title(&tx, "1").await);
        let store = scope.resolve::<dyn SyncStore>().await;
        assert!(!store.has_staged().await.unwrap());
    }

    #[tokio::test]
    async fn sync_row_split_across_apply_batches_materializes_every_column() {
        // Arrange

        let ms = far_future_ms();
        let mut cells: Vec<CellChange> = (0..APPLY_BATCH_CELLS - 1)
            .map(|i| {
                let payload = serde_json::json!({"id": format!("f{i}"), "title": "F", "body": "F"});
                remote_cell(
                    &format!("f{i}"),
                    merge::ROW_COL,
                    Some(serde_json::to_vec(&payload).unwrap()),
                    ms,
                    0,
                )
            })
            .collect();
        for (counter, (col, value)) in [("title", "Title"), ("body", "Body")]
            .into_iter()
            .enumerate()
        {
            let mut cell = remote_cell(
                "strict",
                col,
                Some(value.as_bytes().to_vec()),
                ms,
                u32::try_from(counter).unwrap() + 1,
            );
            cell.tbl = "strict_notes".to_string();
            cells.push(cell);
        }
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .times(1)
            .returning(move |_| {
                Ok(PullResponse {
                    cells: cells.clone(),
                    next_server_seq: 1,
                    has_more: false,
                })
            });

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        {
            let mut guard = tx.lock().await;
            sqlx::query(
                "CREATE TABLE strict_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, \
                 body TEXT NOT NULL)",
            )
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        store
            .register_table("strict_notes", Granularity::Column, &[])
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        engine.sync().await.unwrap();
        scope.save_changes().await.unwrap();

        // Assert

        let mut guard = tx.lock().await;
        let strict: Option<(String, String)> =
            sqlx::query_as("SELECT title, body FROM strict_notes WHERE id = 'strict'")
                .fetch_optional(guard.as_mut())
                .await
                .unwrap();
        let notes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes")
            .fetch_one(guard.as_mut())
            .await
            .unwrap();
        assert_eq!(Some(("Title".to_string(), "Body".to_string())), strict);
        assert_eq!(i64::try_from(APPLY_BATCH_CELLS - 1).unwrap(), notes);
    }

    #[tokio::test]
    async fn sync_apply_failing_in_a_later_batch_keeps_earlier_batches_and_the_rest_staged() {
        // Arrange

        let ms = far_future_ms();
        let mut cells: Vec<CellChange> = (0..APPLY_BATCH_CELLS)
            .map(|i| {
                let payload = serde_json::json!({"id": format!("f{i}"), "title": "F", "body": "F"});
                remote_cell(
                    &format!("f{i}"),
                    merge::ROW_COL,
                    Some(serde_json::to_vec(&payload).unwrap()),
                    ms,
                    0,
                )
            })
            .collect();
        let mut unregistered = remote_cell("u", merge::ROW_COL, None, ms, 1);
        unregistered.tbl = "unregistered".to_string();
        cells.push(unregistered);
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .times(1)
            .returning(move |_| {
                Ok(PullResponse {
                    cells: cells.clone(),
                    next_server_seq: 1,
                    has_more: false,
                })
            });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        create_notes_table(&setup_tx).await;
        setup_scope
            .resolve::<dyn SyncStore>()
            .await
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        setup_scope.save_changes().await.unwrap();

        // Act

        let result = {
            let scope = injector.start_scope();
            scope.resolve::<DefaultSyncEngine>().await.sync().await
        };

        // Assert

        assert!(matches!(result, Err(SyncError::UnregisteredTable(_))));
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        assert_eq!(Some("F".to_string()), get_note_title(&tx, "f0").await);
        let staged = scope
            .resolve::<dyn SyncStore>()
            .await
            .take_staged(10)
            .await
            .unwrap();
        assert_eq!(
            vec!["unregistered"],
            staged
                .cells
                .iter()
                .map(|c| c.tbl.as_str())
                .collect::<Vec<_>>()
        );
    }

    #[tokio::test]
    async fn sync_restart_between_batches_of_one_row_still_materializes_it() {
        // Arrange

        let ms = far_future_ms();
        let strict_cell = |col: &str, value: &str, counter: u32| {
            let mut cell = remote_cell("strict", col, Some(value.as_bytes().to_vec()), ms, counter);
            cell.tbl = "strict_notes".to_string();
            cell
        };
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 1,
                has_more: false,
            })
        });

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        {
            let mut guard = setup_tx.lock().await;
            sqlx::query(
                "CREATE TABLE strict_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, \
                 body TEXT NOT NULL)",
            )
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        let setup_store = setup_scope.resolve::<dyn SyncStore>().await;
        setup_store
            .register_table("strict_notes", Granularity::Column, &[])
            .await
            .unwrap();
        setup_store
            .stage_remote(ChangeBatch {
                cells: vec![strict_cell("title", "Title", 0)],
            })
            .await
            .unwrap();
        setup_scope.save_changes().await.unwrap();
        // The first batch commits, then the app quits with the row's title only buffered in memory.
        {
            let scope = injector.start_scope();
            let store = scope.resolve::<dyn SyncStore>().await;
            let batch = store.take_staged(APPLY_BATCH_CELLS).await.unwrap();
            store.apply_remote(batch, false).await.unwrap();
            store
                .stage_remote(ChangeBatch {
                    cells: vec![strict_cell("body", "Body", 1)],
                })
                .await
                .unwrap();
            scope.save_changes().await.unwrap();
        }

        // Act

        let scope = injector.start_scope();
        scope
            .resolve::<DefaultSyncEngine>()
            .await
            .sync()
            .await
            .unwrap();
        scope.save_changes().await.unwrap();

        // Assert

        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        let strict: Option<(String, String)> =
            sqlx::query_as("SELECT title, body FROM strict_notes WHERE id = 'strict'")
                .fetch_optional(guard.as_mut())
                .await
                .unwrap();
        assert_eq!(Some(("Title".to_string(), "Body".to_string())), strict);
    }

    #[tokio::test]
    async fn sync_local_edit_after_a_cell_was_staged_wins_over_it() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "Body"});
        let staged = remote_cell(
            "1",
            merge::ROW_COL,
            Some(serde_json::to_vec(&payload).unwrap()),
            far_future_ms(),
            0,
        );
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        create_notes_table(&setup_tx).await;
        let setup_store = setup_scope.resolve::<dyn SyncStore>().await;
        setup_store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        insert_note(&setup_tx, "1", "Before", "Body").await;
        setup_store
            .stage_remote(ChangeBatch {
                cells: vec![staged],
            })
            .await
            .unwrap();
        setup_scope.save_changes().await.unwrap();
        {
            let mut guard = setup_tx.lock().await;
            sqlx::query("UPDATE notes SET title = 'Local' WHERE id = '1'")
                .execute(guard.as_mut())
                .await
                .unwrap();
        }
        setup_scope.save_changes().await.unwrap();

        // Act

        let scope = injector.start_scope();
        scope
            .resolve::<DefaultSyncEngine>()
            .await
            .sync()
            .await
            .unwrap();
        scope.save_changes().await.unwrap();

        // Assert

        let tx = scope.resolve::<DbTransaction>().await;
        assert_eq!(Some("Local".to_string()), get_note_title(&tx, "1").await);
    }

    #[tokio::test]
    async fn sync_pulled_child_of_locally_deleted_parent_repairs_and_pushes_repair() {
        // Arrange

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![row_cell(
                    "children",
                    "c1",
                    serde_json::json!({"id": "c1", "parent_id": "missing-parent"}),
                    far_future_ms(),
                    0,
                )],
                next_server_seq: 1,
                has_more: false,
            })
        });
        let pushed_batch: Arc<Mutex<Option<ChangeBatch>>> = Arc::new(Mutex::new(None));
        let pushed_batch_clone = pushed_batch.clone();
        backend_client
            .expect_push_changes()
            .times(1)
            .returning(move |batch| {
                *pushed_batch_clone.lock().unwrap() = Some(batch);
                Ok(())
            });

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_parents_table(&tx).await;
        create_children_table(&tx).await;
        {
            let mut guard = tx.lock().await;
            sqlx::query(
                "INSERT INTO sync_cells(tbl, row_id, col, hlc, is_remote)
                 VALUES ('parents', json_array('missing-parent'), ?1, hlc_now(), 0)",
            )
            .bind(merge::DELETED_COL)
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        let store = scope.resolve::<dyn SyncStore>().await;
        store
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
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        engine.sync().await.unwrap();

        // Assert

        assert!(!child_exists(&tx, "c1").await);
        let pushed = pushed_batch.lock().unwrap().clone().unwrap();
        assert!(
            pushed
                .cells
                .iter()
                .any(|cell| cell.tbl == "children" && cell.col == merge::DELETED_COL),
            "{pushed:?}"
        );
    }

    fn column_cell(tbl: &str, id: &str, col: &str, value: &[u8], counter: u32) -> CellChange {
        let hlc = Hlc::new(1_000_000, counter, DeviceId::from_name("remote-device"));
        CellChange {
            tbl: tbl.to_string(),
            row_id: single_row_id(id),
            col: col.to_string(),
            value: Some(value.to_vec()),
            hlc: hlc.format(),
            device_id: "remote-device".to_string(),
        }
    }

    #[tokio::test]
    async fn sync_parent_with_column_unknown_locally_keeps_child_across_cycles() {
        // Arrange

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![
                    column_cell("parents", "p1", "name", b"Parent", 0),
                    column_cell("parents", "p1", "added_by_newer_version", b"1", 1),
                    row_cell(
                        "children",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": "p1"}),
                        1_000_000,
                        2,
                    ),
                ],
                next_server_seq: 1,
                has_more: false,
            })
        });
        let pushed: Arc<Mutex<Vec<CellChange>>> = Arc::new(Mutex::new(Vec::new()));
        let pushed_clone = pushed.clone();
        backend_client
            .expect_push_changes()
            .returning(move |batch| {
                pushed_clone.lock().unwrap().extend(batch.cells);
                Ok(())
            });

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        create_parents_table(&setup_tx).await;
        create_children_table(&setup_tx).await;
        let store = setup_scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("parents", Granularity::Column, &[])
            .await
            .unwrap();
        store
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
        setup_scope.save_changes().await.unwrap();

        // Act

        for _ in 0..2 {
            let scope = injector.start_scope();
            let engine = scope.resolve::<DefaultSyncEngine>().await;
            engine.sync().await.unwrap();
            scope.save_changes().await.unwrap();
        }

        // Assert

        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        assert!(child_exists(&tx, "c1").await);
        let pushed = pushed.lock().unwrap();
        assert!(
            !pushed.iter().any(|cell| cell.col == merge::DELETED_COL),
            "{pushed:?}"
        );
    }

    #[tokio::test]
    async fn sync_parent_missing_required_column_keeps_child_until_column_arrives() {
        // Arrange

        let pull_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning({
            let pull_count = pull_count.clone();
            move |_| {
                let pull = pull_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let mut cells = vec![
                    column_cell("required_parents", "p1", "name", b"Parent", 0),
                    row_cell(
                        "children",
                        "c1",
                        serde_json::json!({"id": "c1", "parent_id": "p1"}),
                        1_000_000,
                        1,
                    ),
                ];
                if pull == 2 {
                    cells.push(column_cell("required_parents", "p1", "kind", b"Kind", 2));
                }
                Ok(PullResponse {
                    cells,
                    next_server_seq: 1,
                    has_more: false,
                })
            }
        });
        backend_client.expect_push_changes().returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        {
            let mut guard = setup_tx.lock().await;
            sqlx::query(
                "CREATE TABLE required_parents (id TEXT PRIMARY KEY, name TEXT, kind TEXT NOT NULL)",
            )
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        create_children_table(&setup_tx).await;
        let store = setup_scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("required_parents", Granularity::Column, &[])
            .await
            .unwrap();
        store
            .register_table(
                "children",
                Granularity::Row,
                &[FkConstraint::new(
                    "parent_id",
                    "required_parents",
                    "id",
                    FkPolicy::DiscardRow,
                )],
            )
            .await
            .unwrap();
        setup_scope.save_changes().await.unwrap();

        // Act

        for _ in 0..3 {
            let scope = injector.start_scope();
            let engine = scope.resolve::<DefaultSyncEngine>().await;
            engine.sync().await.unwrap();
            scope.save_changes().await.unwrap();
        }

        // Assert

        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        assert!(child_exists(&tx, "c1").await);
        let mut guard = tx.lock().await;
        let kind: Option<String> =
            sqlx::query_scalar("SELECT kind FROM required_parents WHERE id = 'p1'")
                .fetch_optional(guard.as_mut())
                .await
                .unwrap();
        assert_eq!(Some("Kind".to_string()), kind);
    }

    #[tokio::test]
    async fn sync_declared_fk_child_of_absent_parent_waits_without_holding_cursor_or_pushing_delete()
     {
        // Arrange

        let pull_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning({
            let pull_count = pull_count.clone();
            move |_| {
                let pull = pull_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let mut cells = vec![row_cell(
                    "reviews",
                    "r1",
                    serde_json::json!({"id": "r1", "parent_id": "p1"}),
                    1_000_000,
                    0,
                )];
                if pull == 2 {
                    cells.push(row_cell(
                        "parents",
                        "p1",
                        serde_json::json!({"id": "p1", "name": "Parent"}),
                        1_000_000,
                        1,
                    ));
                }
                Ok(PullResponse {
                    cells,
                    next_server_seq: 1,
                    has_more: false,
                })
            }
        });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let setup_scope = injector.start_scope();
        let setup_tx = setup_scope.resolve::<DbTransaction>().await;
        create_parents_table(&setup_tx).await;
        {
            let mut guard = setup_tx.lock().await;
            sqlx::query(
                "CREATE TABLE reviews (id TEXT PRIMARY KEY, parent_id TEXT, \
                 FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE)",
            )
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        let store = setup_scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("parents", Granularity::Row, &[])
            .await
            .unwrap();
        store
            .register_table(
                "reviews",
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
        setup_scope.save_changes().await.unwrap();

        // Act

        let mut cursors = Vec::new();
        for _ in 0..3 {
            let scope = injector.start_scope();
            let engine = scope.resolve::<DefaultSyncEngine>().await;
            engine.sync().await.unwrap();
            scope.save_changes().await.unwrap();
            let store = scope.resolve::<dyn SyncStore>().await;
            cursors.push(store.get_last_pulled_server_seq().await.unwrap());
        }

        // Assert

        assert_eq!(vec![Some(1); 3], cursors);
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        let reviews: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reviews")
            .fetch_one(guard.as_mut())
            .await
            .unwrap();
        assert_eq!(1, reviews);
    }

    #[tokio::test]
    async fn sync_device_on_newer_schema_fails_without_pushing_or_keeping_changes() {
        // Arrange

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![row_cell(
                    "device_schema_versions",
                    "other-device",
                    serde_json::json!({"device_id": "other-device", "version": i64::MAX}),
                    1_000_000,
                    0,
                )],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().never();

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("device_schema_versions", Granularity::Row, &[])
            .await
            .unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        let actual = engine.sync().await;

        // Assert

        assert!(matches!(actual, Err(SyncError::AppUpdateRequired { .. })));
        assert_eq!(None, store.get_last_pulled_server_seq().await.unwrap());
    }

    #[tokio::test]
    async fn sync_registered_post_sync_task_runs_it_before_pushing_local_changes() {
        // Arrange

        let mut sequence = Sequence::new();
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 0,
                has_more: false,
            })
        });

        let mut task = MockPostSyncTask::new();
        task.expect_name().returning(|| "test task");
        task.expect_run()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|| Ok(()));
        backend_client
            .expect_push_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| Ok(()));

        let mut injector = initialize_test_injector(backend_client).await;
        let task: Arc<dyn crate::sync::post_sync_task::PostSyncTask> = Arc::new(task);
        injector.register_scope_factory::<PostSyncTasks>(move |_| {
            let task = task.clone();
            Box::pin(async move { Arc::new(PostSyncTasks::new(vec![task])) })
        });

        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        insert_note(&tx, "1", "Local", "Body").await;
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act & Assert

        engine.sync().await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn sync_local_write_during_push_succeeds_and_stays_pending() {
        // Arrange

        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 0,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().returning(|_| {
            std::thread::sleep(std::time::Duration::from_millis(500));
            Ok(())
        });

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        insert_note(&tx, "1", "Before", "Body").await;
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        let concurrent_write = async {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            let other_scope = injector.start_scope();
            let other_tx = other_scope.resolve::<DbTransaction>().await;
            insert_note(&other_tx, "2", "During", "Body").await;
            other_scope.save_changes().await
        };

        // Act

        let (sync_result, write_result) = tokio::join!(engine.sync(), concurrent_write);

        // Assert

        sync_result.unwrap();
        write_result.unwrap();
        scope.save_changes().await.unwrap();
        let next_scope = injector.start_scope();
        let pending = next_scope
            .resolve::<dyn SyncStore>()
            .await
            .changes_since_last_push()
            .await
            .unwrap();
        let pending_rows: Vec<&str> = pending.cells.iter().map(|c| c.row_id.as_str()).collect();
        assert_eq!(vec![single_row_id("2").as_str()], pending_rows);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn sync_local_write_during_push_with_rows_waiting_for_parent_is_not_blocked() {
        // Arrange

        let push_done = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![row_cell(
                    "reviews",
                    "r1",
                    serde_json::json!({"id": "r1", "parent_id": "absent"}),
                    1_000_000,
                    0,
                )],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().returning({
            let push_done = push_done.clone();
            move |_| {
                std::thread::sleep(std::time::Duration::from_millis(1_000));
                push_done.store(true, std::sync::atomic::Ordering::SeqCst);
                Ok(())
            }
        });

        let injector = Arc::new(initialize_test_injector(backend_client).await);
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        create_parents_table(&tx).await;
        {
            let mut guard = tx.lock().await;
            sqlx::query(
                "CREATE TABLE reviews (id TEXT PRIMARY KEY, parent_id TEXT, \
                 FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE)",
            )
            .execute(guard.as_mut())
            .await
            .unwrap();
        }
        let store = scope.resolve::<dyn SyncStore>().await;
        for table in ["notes", "parents", "reviews"] {
            store
                .register_table(table, Granularity::Row, &[])
                .await
                .unwrap();
        }
        insert_note(&tx, "1", "Before", "Body").await;
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Spawned, as the mock's blocking sleep would also stall a future joined on the same task.
        let concurrent_write = tokio::spawn({
            let injector = injector.clone();
            let push_done = push_done.clone();
            async move {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let other_scope = injector.start_scope();
                let other_tx = other_scope.resolve::<DbTransaction>().await;
                insert_note(&other_tx, "2", "During", "Body").await;
                other_scope.save_changes().await.unwrap();
                push_done.load(std::sync::atomic::Ordering::SeqCst)
            }
        });

        // Act

        let sync_result = engine.sync().await;
        let finished_after_push = concurrent_write.await.unwrap();

        // Assert

        sync_result.unwrap();
        assert!(!finished_after_push);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn sync_local_write_during_first_pull_fetch_succeeds() {
        // Arrange

        let payload = serde_json::json!({"id": "remote", "title": "Remote", "body": "RBody"});
        let value = Some(serde_json::to_vec(&payload).unwrap());
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(move |_| {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let cell = remote_cell("remote", merge::ROW_COL, value.clone(), far_future_ms(), 0);
            Ok(PullResponse {
                cells: vec![cell],
                next_server_seq: 1,
                has_more: false,
            })
        });
        backend_client.expect_push_changes().returning(|_| Ok(()));

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        let concurrent_write = async {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            let other_scope = injector.start_scope();
            let other_tx = other_scope.resolve::<DbTransaction>().await;
            insert_note(&other_tx, "local", "During", "Body").await;
            other_scope.save_changes().await
        };

        // Act

        let (sync_result, write_result) = tokio::join!(engine.sync(), concurrent_write);

        // Assert

        sync_result.unwrap();
        write_result.unwrap();
        assert_eq!(
            Some("Remote".to_string()),
            get_note_title(&tx, "remote").await
        );
        assert_eq!(
            Some("During".to_string()),
            get_note_title(&tx, "local").await
        );
    }

    #[tokio::test]
    async fn sync_pull_fails_on_second_page_keeps_first_page_and_its_cursor() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Page one", "body": "Body"});
        let value = Some(serde_json::to_vec(&payload).unwrap());
        let mut sequence = Sequence::new();
        let mut backend_client = MockAmberBackendClient::new();
        backend_client
            .expect_pull_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(move |_| {
                let cell = remote_cell("1", merge::ROW_COL, value.clone(), far_future_ms(), 0);
                Ok(PullResponse {
                    cells: vec![cell],
                    next_server_seq: 7,
                    has_more: true,
                })
            });
        backend_client
            .expect_pull_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| Err(AmberBackendClientError::Unauthorized));

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        let result = engine.sync().await;

        // Assert

        assert!(result.is_err());
        let next_scope = injector.start_scope();
        let next_store = next_scope.resolve::<dyn SyncStore>().await;
        assert_eq!(
            Some(7),
            next_store.get_last_pulled_server_seq().await.unwrap()
        );
        let next_tx = next_scope.resolve::<DbTransaction>().await;
        assert_eq!(
            Some("Page one".to_string()),
            get_note_title(&next_tx, "1").await
        );
    }

    #[tokio::test]
    async fn sync_push_fails_on_second_chunk_keeps_first_chunk_marked_pushed() {
        // Arrange

        let mut sequence = Sequence::new();
        let mut backend_client = MockAmberBackendClient::new();
        backend_client.expect_pull_changes().returning(|_| {
            Ok(PullResponse {
                cells: vec![],
                next_server_seq: 0,
                has_more: false,
            })
        });
        backend_client
            .expect_push_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| Ok(()));
        backend_client
            .expect_push_changes()
            .times(1)
            .in_sequence(&mut sequence)
            .returning(|_| Err(AmberBackendClientError::Unauthorized));

        let injector = initialize_test_injector(backend_client).await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        create_notes_table(&tx).await;
        let store = scope.resolve::<dyn SyncStore>().await;
        store
            .register_table("notes", Granularity::Row, &[])
            .await
            .unwrap();
        // Each body over half the push cap, so the two rows go in separate chunks.
        let body = "x".repeat(MAX_PUSH_BATCH_BYTES / 2 + 1);
        insert_note(&tx, "1", "First", &body).await;
        insert_note(&tx, "2", "Second", &body).await;
        scope.save_changes().await.unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        let result = engine.sync().await;

        // Assert

        assert!(result.is_err());
        let next_scope = injector.start_scope();
        let pending = next_scope
            .resolve::<dyn SyncStore>()
            .await
            .changes_since_last_push()
            .await
            .unwrap();
        let pending_rows: Vec<&str> = pending.cells.iter().map(|c| c.row_id.as_str()).collect();
        assert_eq!(vec![single_row_id("2").as_str()], pending_rows);
    }

    fn cell_with_value_len(len: usize) -> CellChange {
        CellChange {
            tbl: "notes".to_string(),
            row_id: single_row_id("1"),
            col: merge::ROW_COL.to_string(),
            value: Some(vec![0u8; len]),
            hlc: Hlc::new(0, 0, DeviceId::from_name("device")).format(),
            device_id: "device".to_string(),
        }
    }

    #[test]
    fn chunk_by_size_single_cell_under_cap_returns_one_chunk() {
        // Arrange

        let cells = vec![cell_with_value_len(10)];

        // Act

        let actual = DefaultSyncEngine::chunk_by_size(cells, 1_000);

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(1, actual[0].len());
    }

    #[test]
    fn chunk_by_size_cells_exceeding_cap_together_split_into_multiple_chunks() {
        // Arrange

        let cells = vec![
            cell_with_value_len(60),
            cell_with_value_len(60),
            cell_with_value_len(60),
        ];

        // Act

        let actual = DefaultSyncEngine::chunk_by_size(cells, 100);

        // Assert

        assert_eq!(3, actual.len());
        for chunk in &actual {
            assert_eq!(1, chunk.len());
        }
    }

    #[test]
    fn chunk_by_size_single_cell_over_cap_still_returned_alone() {
        // Arrange

        let cells = vec![cell_with_value_len(200)];

        // Act

        let actual = DefaultSyncEngine::chunk_by_size(cells, 100);

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(1, actual[0].len());
    }

    #[test]
    fn chunk_by_size_small_cells_fitting_within_cap_grouped_into_one_chunk() {
        // Arrange

        let cells = vec![
            cell_with_value_len(10),
            cell_with_value_len(10),
            cell_with_value_len(10),
        ];

        // Act

        let actual = DefaultSyncEngine::chunk_by_size(cells, 1_000);

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(3, actual[0].len());
    }
}
