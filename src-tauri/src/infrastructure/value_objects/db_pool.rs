use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::{Mutex, MutexGuard};

use crate::settings::value_objects::database_location::DatabaseLocation;
use crate::sync::sql_functions::SyncClock;

pub struct DbPool {
    pool: Mutex<SqlitePool>,
    location: Mutex<DatabaseLocation>,
    sync_clock: Mutex<Arc<SyncClock>>,
}

impl DbPool {
    pub fn new(pool: SqlitePool, location: DatabaseLocation, sync_clock: Arc<SyncClock>) -> Self {
        Self {
            pool: Mutex::new(pool),
            location: Mutex::new(location),
            sync_clock: Mutex::new(sync_clock),
        }
    }

    /// The HLC clock of the database currently behind this pool — the same one
    /// its connections stamp cells with (see `create_sqlite_pool`).
    pub async fn sync_clock(&self) -> Arc<SyncClock> {
        self.sync_clock.lock().await.clone()
    }

    pub async fn location(&self) -> DatabaseLocation {
        self.location.lock().await.clone()
    }

    pub async fn pool(&self) -> MutexGuard<'_, SqlitePool> {
        self.pool.lock().await
    }

    /// Swaps in `new_pool` and returns the pool it replaced. The caller is
    /// responsible for making sure the old pool's connections have actually
    /// been returned (e.g. by committing whatever transaction is still
    /// checked out from it) before awaiting `close()` on it — otherwise that
    /// await never returns.
    pub async fn set_pool(
        &self,
        new_pool: SqlitePool,
        new_location: DatabaseLocation,
        new_sync_clock: Arc<SyncClock>,
    ) -> SqlitePool {
        let mut pool = self.pool.lock().await;
        let mut location = self.location.lock().await;
        let mut sync_clock = self.sync_clock.lock().await;

        let old_pool = std::mem::replace(&mut *pool, new_pool);
        *location = new_location;
        *sync_clock = new_sync_clock;

        old_pool
    }
}
