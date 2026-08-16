use sqlx::SqlitePool;
use tokio::sync::{Mutex, MutexGuard};

use crate::settings::value_objects::database_location::DatabaseLocation;

pub struct DbPool {
    pool: Mutex<SqlitePool>,
    location: Mutex<DatabaseLocation>,
}

impl DbPool {
    pub fn new(pool: SqlitePool, location: DatabaseLocation) -> Self {
        Self {
            pool: Mutex::new(pool),
            location: Mutex::new(location),
        }
    }

    pub async fn location(&self) -> DatabaseLocation {
        self.location.lock().await.clone()
    }

    pub async fn pool(&self) -> MutexGuard<'_, SqlitePool> {
        self.pool.lock().await
    }

    pub async fn set_pool(&self, new_pool: SqlitePool, new_location: DatabaseLocation) {
        let mut pool = self.pool.lock().await;
        let mut location = self.location.lock().await;

        // Swap in the new pool immediately rather than awaiting `close()` on
        // the old one here: the calling scope may itself already hold a
        // checked-out, uncommitted connection from the old pool (e.g. a
        // profile switch during sign-in, resolved as part of the same DI
        // scope that also opened a `DbTransaction`). `close()` doesn't
        // return until every checked-out connection is returned, but that
        // connection is only released by this scope's own `save_changes()`,
        // which runs after this call — awaiting it inline would deadlock.
        // Closing in the background lets it finish once that connection is
        // eventually returned.
        let old_pool = std::mem::replace(&mut *pool, new_pool);
        *location = new_location;

        tokio::spawn(async move {
            old_pool.close().await;
        });
    }
}
