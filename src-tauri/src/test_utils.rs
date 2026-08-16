use std::{env, path::PathBuf, sync::Arc};

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
    sync::store::SyncStore,
};

pub async fn create_temp_directory() -> PathBuf {
    let path = env::temp_dir().join(Uuid::new_v4().to_string());
    fs::create_dir_all(path.clone()).await.unwrap();
    path
}

pub async fn create_test_injector() -> Injector {
    create_test_injector_with_sqlite_url("sqlite::memory:").await
}

/// Backed by a real temp-file SQLite database (in WAL mode) rather than an
/// in-memory one. Needed by tests that end up with a second connection open
/// while the first still has an uncommitted transaction — e.g.
/// `TransactionManager::save_changes` being called mid-scope, which begins a
/// new transaction on a fresh connection before committing the old one. A
/// shared-cache `:memory:` database can deadlock in that scenario (opening a
/// second connection blocks on the first's uncommitted write, and nothing
/// times that out), the same reason `default_backup_service.rs`'s tests use
/// a real file. A real file in WAL mode doesn't hit this, since WAL is
/// already the file's persisted journal mode by the time a second connection
/// opens, so it doesn't need to renegotiate it.
pub async fn create_file_backed_test_injector() -> Injector {
    let db_path = create_temp_directory().await.join("amber.db");
    create_test_injector_with_sqlite_url(&format!("sqlite:///{}", db_path.to_string_lossy())).await
}

async fn create_test_injector_with_sqlite_url(sqlite_url: &str) -> Injector {
    let mut injector = Injector::default();

    let app_data_directory = AppDataDirectory::new(create_temp_directory().await);
    injector.register_singleton(Arc::new(app_data_directory.clone()));

    let sqlite_pool = create_sqlite_pool(sqlite_url).await.unwrap();
    let database_location = DatabaseLocation::new_unchecked(app_data_directory.get_path().clone());

    let db_pool = DbPool::new(sqlite_pool, database_location);
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

    let secrets_repository = DiskSecretsRepository::new(&app_data_directory);
    injector.register_singleton::<dyn SecretsRepository>(Arc::new(secrets_repository));

    injector
}
