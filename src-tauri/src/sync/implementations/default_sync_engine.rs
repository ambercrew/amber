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
use crate::sync::store::SyncStore;

#[derive(ScopeInjectable)]
pub struct DefaultSyncEngine {
    store: Arc<dyn SyncStore>,
    backend_client: Arc<dyn AmberBackendClient>,
    connection_manager: Arc<dyn DatabaseConnectionManager>,
    transaction_manager: Arc<dyn TransactionManager>,
}

#[async_trait]
impl SyncEngine for DefaultSyncEngine {
    async fn sync(&self) -> Result<(), SyncError> {
        // Cells can be applied out of order relative to their foreign key
        // references (e.g. a child row's cell before its parent's), so
        // constraint checks are deferred until this whole cycle commits
        // instead of failing mid-sync.
        self.connection_manager
            .disable_foreign_key_constraint_for_current_transaction()
            .await?;

        let result = self.sync_inner().await;

        self.connection_manager
            .enable_foreign_key_constraint_for_current_transaction()
            .await?;

        result
    }
}

impl DefaultSyncEngine {
    async fn sync_inner(&self) -> Result<(), SyncError> {
        // Pulled before pushing so the server doesn't have to echo back the
        // changes we're about to send it in the same cycle.
        let mut since_server_seq = self.store.get_last_pulled_server_seq().await?;
        loop {
            let pull_response = self.backend_client.pull_changes(since_server_seq).await?;
            let has_more = pull_response.has_more;
            let next_server_seq = pull_response.next_server_seq;
            let remote_batch = ChangeBatch {
                cells: pull_response.cells,
            };
            if !remote_batch.cells.is_empty() {
                self.store.apply_remote(remote_batch, !has_more).await?;
            }
            since_server_seq = Some(next_server_seq);

            // A row's columns can still be split across the *next* page (see
            // `SyncStore::apply_remote`), so only persist the cursor and commit
            // once nothing is left half-materialized — otherwise a crash before
            // the next page arrives would strand those columns: the cursor
            // would already be past them and the server wouldn't resend them.
            if !self.store.has_pending_changes().await? {
                self.store
                    .set_last_pulled_server_seq(next_server_seq)
                    .await?;
                self.transaction_manager.save_changes().await?;
                // `save_changes` commits into a fresh transaction, which resets
                // SQLite's per-transaction deferred-FK-check pragma — re-arm it
                // so the next page can still land rows out of FK order.
                self.connection_manager
                    .disable_foreign_key_constraint_for_current_transaction()
                    .await?;
            }

            if !has_more {
                break;
            }
        }

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
}

#[cfg(test)]
mod tests {
    use injector::injector::Injector;
    use injector::register_scope;
    use mockall::Sequence;
    use sqlx::Row;

    use crate::backend::clients::amber_backend_client::MockAmberBackendClient;
    use crate::generated_code::{CellChange, PullResponse};
    use crate::infrastructure::value_objects::db_transaction::DbTransaction;
    use crate::sync::hlc::DeviceId;
    use crate::sync::sql_functions;
    use crate::sync::utils::merge;
    use crate::sync::value_objects::granularity::Granularity;
    use crate::test_utils::create_file_backed_test_injector;

    use super::*;

    /// `SYNC_CLOCK` is a process-wide static shared by every test in this
    /// binary, so a fixed "far future" constant can collide with the clock's
    /// live position once enough parallel tests have advanced it via
    /// `observe()`. Deriving the value from the clock's current tip instead
    /// guarantees it's always ahead of anything written so far.
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
            .register_table("notes", Granularity::Row)
            .await
            .unwrap();
        insert_note(&tx, "1", "Local", "Body").await;
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act & Assert

        engine.sync().await.unwrap();
    }

    #[tokio::test]
    async fn sync_applies_pulled_remote_changes_to_local_store() {
        // Arrange

        let payload = serde_json::json!({"id": "1", "title": "Remote", "body": "RBody"});
        let value = Some(serde_json::to_vec(&payload).unwrap());

        let mut backend_client = MockAmberBackendClient::new();
        // The sync clock is only initialized once the injector (and thus the
        // sqlite pool) is set up, so `far_future_ms` is computed lazily here
        // rather than before the injector exists.
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
            .register_table("notes", Granularity::Row)
            .await
            .unwrap();
        let engine = scope.resolve::<DefaultSyncEngine>().await;

        // Act

        engine.sync().await.unwrap();

        // Assert

        assert_eq!(Some("Remote".to_string()), get_note_title(&tx, "1").await);
    }
}
