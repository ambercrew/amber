use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use tokio::fs;

use crate::{
    common::utils::create_sqlite_pool::create_sqlite_pool_from_location,
    database::database_connection_manager::{
        DatabaseConnectionManager, DatabaseConnectionManagerError,
    },
    infrastructure::value_objects::{db_pool::DbPool, db_transaction::DbTransaction},
    settings::value_objects::database_location::DatabaseLocation,
    sync::bootstrap::register_sync_tables_on_pool,
};

#[derive(ScopeInjectable)]
pub struct SqliteDatabaseConnectionManager {
    pool: Arc<DbPool>,
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl DatabaseConnectionManager for SqliteDatabaseConnectionManager {
    async fn connect_to_database(
        &self,
        database_location: DatabaseLocation,
    ) -> Result<(), DatabaseConnectionManagerError> {
        let (new_pool, new_sync_clock) =
            match create_sqlite_pool_from_location(&database_location).await {
                Err(err) => {
                    return Err(DatabaseConnectionManagerError::ErrorChangingDatabase(err));
                }
                Ok(pool) => pool,
            };

        // This scope's own transaction may still be holding a connection
        // checked out from the *old* pool, which would otherwise keep it
        // open until this scope's `save_changes()` runs — well after this
        // call returns. Commit it now (against the old pool it was actually
        // begun on) and replace it with a fresh transaction on the new pool,
        // mirroring what `SqliteTransactionManager::save_changes` does. This
        // releases the old pool's connection up front, so it can be closed
        // synchronously below instead of racing its background closure with
        // whoever needs the old database file next (e.g. deleting it after a
        // profile switch — see `move_database_to`).
        {
            let mut guard = self.tx.lock().await;
            let new_tx = new_pool.begin().await.map_err(|err| {
                DatabaseConnectionManagerError::ErrorChangingDatabase(Box::new(err))
            })?;
            let old_tx = std::mem::replace(&mut *guard, new_tx);
            drop(guard);

            old_tx.commit().await.map_err(|err| {
                DatabaseConnectionManagerError::ErrorChangingDatabase(Box::new(err))
            })?;
        }

        let old_pool = self
            .pool
            .set_pool(new_pool, database_location, new_sync_clock)
            .await;
        old_pool.close().await;

        // The database just swapped underneath any in-flight DI scope, whose
        // own transaction (if any) is still bound to the old one — so the
        // new database's tables need registering for change tracking again
        // here, against the new pool directly, rather than leaving it to
        // every caller that can end up switching databases to remember.
        let pool_guard = self.pool.pool().await;
        register_sync_tables_on_pool(&pool_guard)
            .await
            .map_err(|err| DatabaseConnectionManagerError::ErrorChangingDatabase(Box::new(err)))?;

        Ok(())
    }

    async fn move_database_to(
        &self,
        new_database_location: DatabaseLocation,
    ) -> Result<(), DatabaseConnectionManagerError> {
        let old_location = self.pool.location().await.get_path().clone();

        self.copy_database_to(new_database_location.get_path())
            .await?;
        self.connect_to_database(new_database_location).await?;

        fs::remove_file(&old_location)
            .await
            .map_err(|err| DatabaseConnectionManagerError::Unknown(Box::new(err)))?;

        Ok(())
    }

    async fn copy_database_to(&self, path: &Path) -> Result<(), DatabaseConnectionManagerError> {
        let pool = self.pool.pool().await;

        if let Some(parent) = path.parent()
            && let Err(err) = fs::create_dir_all(parent).await
        {
            return Err(DatabaseConnectionManagerError::Unknown(Box::new(err)));
        }
        let path = path.to_string_lossy();

        let result = sqlx::query!("VACUUM main INTO $1", path)
            .execute(&*pool)
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(err) => Err(DatabaseConnectionManagerError::Unknown(Box::new(err))),
        }
    }

    async fn disable_foreign_key_constraint_for_current_transaction(
        &self,
    ) -> Result<(), sqlx::Error> {
        log::info!("Disabling foreign key constraint");

        let mut tx = self.tx.lock().await;
        sqlx::query("PRAGMA defer_foreign_keys = ON")
            .execute(tx.as_mut())
            .await?;

        log::info!("Foreign key constraint has been disabled");

        Ok(())
    }

    async fn enable_foreign_key_constraint_for_current_transaction(
        &self,
    ) -> Result<(), sqlx::Error> {
        log::info!("Enabling foreign key constraint");

        let mut tx = self.tx.lock().await;
        sqlx::query("PRAGMA defer_foreign_keys = OFF")
            .execute(tx.as_mut())
            .await?;

        log::info!("Foreign key constraint has been enabled");

        Ok(())
    }
}
