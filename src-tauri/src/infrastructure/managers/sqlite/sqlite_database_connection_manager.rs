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
        let new_pool = match create_sqlite_pool_from_location(&database_location).await {
            Err(err) => {
                return Err(DatabaseConnectionManagerError::ErrorChangingDatabase(err));
            }
            Ok(pool) => pool,
        };

        self.pool.set_pool(new_pool, database_location).await;

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

        // `connect_to_database` swaps the pool but closes the old one in the
        // background (see `DbPool::set_pool`), since this scope's own
        // checked-out connection from the old pool is only released once its
        // `save_changes()` runs, which happens after this call returns. That
        // means the old database file can still be in use for a short time
        // here, so retry the removal instead of failing outright on what is
        // usually just a transient sharing violation.
        const MAX_ATTEMPTS: u32 = 10;
        const RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(100);

        let mut last_err = None;
        for attempt in 1..=MAX_ATTEMPTS {
            match fs::remove_file(&old_location).await {
                Ok(()) => {
                    last_err = None;
                    break;
                }
                Err(err) => {
                    last_err = Some(err);
                    if attempt < MAX_ATTEMPTS {
                        tokio::time::sleep(RETRY_DELAY).await;
                    }
                }
            }
        }

        if let Some(err) = last_err {
            return Err(DatabaseConnectionManagerError::Unknown(Box::new(err)));
        }

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
