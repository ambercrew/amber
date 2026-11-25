use std::{
    env,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use injector::injector::Injector;
use tokio::fs;
use uuid::Uuid;

use injector::register_scope;

use crate::{
    common::event_manager::EventManager,
    common::services::implementations::tauri_event_manager::TauriEventManager,
    common::utils::{create_injector::register_scoped_tx, create_sqlite_pool::create_sqlite_pool},
    database::{
        database_connection_manager::DatabaseConnectionManager,
        transaction_manager::TransactionManager,
    },
    infrastructure::{
        managers::sqlite::{
            sqlite_database_connection_manager::SqliteDatabaseConnectionManager,
            sqlite_transaction_manager::SqliteTransactionManager,
        },
        repositories::disk::disk_secrets_repository::DiskSecretsRepository,
        value_objects::{app_data_directory::AppDataDirectory, db_pool::DbPool},
    },
    secrets::repositories::secrets_repository::SecretsRepository,
    settings::value_objects::database_location::DatabaseLocation,
    sync::implementations::sqlite_sync_store::SqliteSyncStore,
    sync::implementations::sqlite_sync_store::register_scoped_pending_buffer,
    sync::post_sync_tasks::PostSyncTasks,
    sync::store::SyncStore,
};

pub async fn create_temp_directory() -> PathBuf {
    let path = env::temp_dir().join(Uuid::new_v4().to_string());
    fs::create_dir_all(path.clone()).await.unwrap();
    path
}

/// A test injector's temp directory, removed when the injector drops it.
struct TestDirectory(PathBuf);

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub async fn create_test_injector() -> Injector {
    create_test_injector_with_database(false).await
}

/// Backed by a temp-file SQLite database in WAL mode, for tests that open a second connection while
/// the first is mid-transaction (e.g. `save_changes` mid-scope): a shared `:memory:` one can deadlock.
pub async fn create_file_backed_test_injector() -> Injector {
    create_test_injector_with_database(true).await
}

async fn create_test_injector_with_database(file_backed: bool) -> Injector {
    let mut injector = Injector::default();

    let directory = create_temp_directory().await;
    let sqlite_url = if file_backed {
        format!("sqlite:///{}", directory.join("amber.db").to_string_lossy())
    } else {
        "sqlite::memory:".to_string()
    };
    let app_data_directory = AppDataDirectory::new(directory.clone());
    injector.register_singleton(Arc::new(app_data_directory.clone()));
    injector.register_singleton(Arc::new(TestDirectory(directory)));

    let (sqlite_pool, sync_clock) = create_sqlite_pool(&sqlite_url).await.unwrap();
    let database_location = DatabaseLocation::new_unchecked(app_data_directory.get_path().clone());

    let db_pool = DbPool::new(sqlite_pool, database_location, sync_clock);
    injector.register_singleton(Arc::new(db_pool));
    register_scoped_tx(&mut injector);
    register_scoped_pending_buffer(&mut injector);

    let app_handle = tauri::test::mock_app().handle().clone();
    injector.register_singleton(Arc::new(app_handle));
    register_scope!(
        injector,
        dyn EventManager,
        TauriEventManager<tauri::test::MockRuntime>
    );

    register_scope!(injector, dyn TransactionManager, SqliteTransactionManager);
    register_scope!(
        injector,
        dyn DatabaseConnectionManager,
        SqliteDatabaseConnectionManager
    );
    register_scope!(injector, dyn SyncStore, SqliteSyncStore);
    register_scope!(
        injector,
        dyn crate::assets::repositories::asset_repository::AssetRepository,
        crate::infrastructure::repositories::sqlite::sqlite_asset_repository::SqliteAssetRepository
    );
    register_scope!(
        injector,
        dyn crate::assets::services::asset_service::AssetService,
        crate::assets::services::implementations::default_asset_service::DefaultAssetService
    );
    injector.register_singleton(Arc::new(crate::sync::sync_lock::SyncLock::default()));
    injector.register_singleton(Arc::new(
        crate::anki_sync::anki_sync_lock::AnkiSyncLock::default(),
    ));
    injector.register_singleton(Arc::new(
        crate::sync::sync_completion::SyncCompletion::default(),
    ));

    injector.register_scope_factory::<PostSyncTasks>(|_| {
        Box::pin(async move { Arc::new(PostSyncTasks::new(vec![])) })
    });

    let secrets_repository = DiskSecretsRepository::new(&app_data_directory);
    injector.register_singleton::<dyn SecretsRepository>(Arc::new(secrets_repository));

    injector
}

/// Records every pushed event, so tests can assert what a service told the frontend.
#[derive(Default)]
pub struct RecordingEventManager {
    pub events: Mutex<Vec<(String, serde_json::Value)>>,
}

impl RecordingEventManager {
    pub fn names(&self) -> Vec<String> {
        let events = self.events.lock().unwrap();
        events.iter().map(|(name, _)| name.clone()).collect()
    }
}

#[async_trait::async_trait]
impl EventManager for RecordingEventManager {
    async fn push(&self, name: &str, body: serde_json::Value) {
        self.events.lock().unwrap().push((name.to_string(), body));
    }

    async fn emit_all(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn create_file_backed_test_injector_injector_dropped_removes_its_directory() {
        // Arrange

        let injector = create_file_backed_test_injector().await;
        let directory = injector
            .start_scope()
            .resolve::<AppDataDirectory>()
            .await
            .get_path()
            .clone();
        assert!(directory.join("amber.db").exists());

        // Act

        drop(injector);

        // Assert

        assert!(!directory.exists());
    }
}
