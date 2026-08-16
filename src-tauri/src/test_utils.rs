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
    let mut injector = Injector::default();

    let app_data_directory = AppDataDirectory::new(create_temp_directory().await);
    injector.register_singleton(Arc::new(app_data_directory.clone()));

    let sqlite_pool = create_sqlite_pool("sqlite::memory:").await.unwrap();
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
