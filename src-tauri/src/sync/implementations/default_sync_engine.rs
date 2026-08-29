use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::backend::clients::amber_backend_client::AmberBackendClient;
use crate::database::database_connection_manager::DatabaseConnectionManager;
use crate::database::transaction_manager::TransactionManager;
use crate::generated_code::ChangeBatch;
use crate::sync::engine::SyncEngine;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::post_sync_tasks::PostSyncTasks;
use crate::sync::store::SyncStore;
use crate::sync::sync_lock::SyncLock;

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
    async fn sync(&self) -> Result<(), SyncError> {
        // Serializes overlapping sync cycles: out-of-causal-order pushes (child
        // before parent) would trip FK repair into deleting the "orphaned" child
        // and propagating that delete to other devices.
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
    async fn sync_inner(&self) -> Result<(), SyncError> {
        // Cells can arrive out of FK order (child before parent), so
        // constraint checks are deferred until the whole cycle commits.
        self.connection_manager
            .disable_foreign_key_constraint_for_current_transaction()
            .await?;

        // Pull first so the server doesn't echo back what we're about to push.
        let mut since_server_seq = self.store.get_last_pulled_server_seq().await?;
        log::info!("Resuming sync pull from server seq {since_server_seq:?}");

        loop {
            let pull_response = self.backend_client.pull_changes(since_server_seq).await?;
            let has_more = pull_response.has_more;
            let next_server_seq = pull_response.next_server_seq;
            let is_last_page = !has_more;
            let remote_batch = ChangeBatch {
                cells: pull_response.cells,
            };
            // Call even on an empty last page: FK repair and buffered-column
            // flushing only run inside `apply_remote` when `is_last_page`.
            if !remote_batch.cells.is_empty() || is_last_page {
                self.store.apply_remote(remote_batch, is_last_page).await?;
            }
            since_server_seq = Some(next_server_seq);

            // Only persist the cursor and commit once nothing is left
            // half-materialized: a crash would strand columns past the cursor,
            // and a child pulled ahead of its parent would trip the deferred FK
            // check.
            if !self.store.has_pending_changes().await?
                && !self.store.has_unresolved_foreign_keys().await?
            {
                self.store
                    .set_last_pulled_server_seq(next_server_seq)
                    .await?;
                self.transaction_manager.save_changes().await?;

                self.connection_manager
                    .disable_foreign_key_constraint_for_current_transaction()
                    .await?;
            }

            if !has_more {
                break;
            }
        }

        self.run_post_sync_tasks().await?;

        let batch = self.store.changes_since_last_push().await?;
        let up_to_hlc = batch
            .cells
            .last()
            .map(|cell| Hlc::parse(&cell.hlc))
            .transpose()?;
        if let Some(up_to_hlc) = up_to_hlc {
            self.backend_client.push_changes(batch).await?;
            self.store.mark_pushed(&up_to_hlc).await?;
        }

        Ok(())
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

    use crate::backend::clients::amber_backend_client::MockAmberBackendClient;
    use crate::generated_code::{CellChange, PullResponse};
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
    async fn sync_child_page_before_parent_page_commits_only_after_parent_arrives() {
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
}
