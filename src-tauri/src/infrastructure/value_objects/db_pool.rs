use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use sqlx::SqlitePool;
use tokio::sync::{Mutex, MutexGuard};

use crate::settings::value_objects::database_location::DatabaseLocation;
use crate::sync::sql_functions::SyncClock;

pub struct DbPool {
    pool: Mutex<SqlitePool>,
    location: Mutex<DatabaseLocation>,
    sync_clock: Mutex<Arc<SyncClock>>,
    /// Bumped by each `set_pool`, under the pool's lock, so a caller can tell its cloned pool was replaced.
    generation: AtomicU64,
}

impl DbPool {
    pub fn new(pool: SqlitePool, location: DatabaseLocation, sync_clock: Arc<SyncClock>) -> Self {
        Self {
            pool: Mutex::new(pool),
            location: Mutex::new(location),
            sync_clock: Mutex::new(sync_clock),
            generation: AtomicU64::new(0),
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

    /// The current pool, cloned, with its generation (see `is_current`).
    pub async fn current_pool(&self) -> (SqlitePool, u64) {
        let pool = self.pool.lock().await;
        (pool.clone(), self.generation.load(Ordering::Acquire))
    }

    /// Whether the pool `current_pool` returned with `generation` hasn't been swapped out since.
    pub fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::Acquire) == generation
    }

    /// Swaps in `new_pool` and returns the old one. Return its connections first (e.g. commit what's still
    /// checked out from it), or awaiting its `close()` never returns.
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
        self.generation.fetch_add(1, Ordering::AcqRel);
        *location = new_location;
        *sync_clock = new_sync_clock;

        old_pool
    }
}
