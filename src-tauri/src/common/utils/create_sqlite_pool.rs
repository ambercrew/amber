use std::str::FromStr;
use std::sync::Arc;

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use tokio::fs;

use crate::sync::sql_functions::{SyncClock, register_sync_sql_functions};
use crate::{SourceError, settings::value_objects::database_location::DatabaseLocation};

pub async fn create_sqlite_pool_from_location(
    database_location: &DatabaseLocation,
) -> Result<(SqlitePool, Arc<SyncClock>), SourceError> {
    if let Some(parent) = database_location.get_path().parent() {
        fs::create_dir_all(parent).await?;
    }
    Ok(create_sqlite_pool(&format!("sqlite:///{}", database_location)).await?)
}

/// Opens `url` and returns it together with the [`SyncClock`] that belongs to
/// it: the clock is registered on every connection this pool opens, so the
/// sync SQL functions used by change-tracking triggers issue HLCs under this
/// database's own device id, and is handed to callers to pass on through DI
/// (see `DbPool`) instead of being reachable as process-wide state.
pub async fn create_sqlite_pool(url: &str) -> Result<(SqlitePool, Arc<SyncClock>), sqlx::Error> {
    let sync_clock = SyncClock::new();

    let options = SqliteConnectOptions::from_str(url)?
        .journal_mode(SqliteJournalMode::Wal)
        .optimize_on_close(true, None)
        .foreign_keys(true)
        .synchronous(SqliteSynchronous::Normal)
        .pragma("cache_size", "-65536")
        .pragma("temp_store", "memory")
        .pragma("recursive_triggers", "true")
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .after_connect({
            let sync_clock = sync_clock.clone();
            move |connection, _| {
                let sync_clock = sync_clock.clone();
                Box::pin(register_sync_sql_functions(connection, sync_clock))
            }
        })
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations/").run(&pool).await?;

    // Only possible once the migrations above have created the sync tables the
    // clock seeds itself from; until then the SQL functions registered on this
    // pool's connections report that sync isn't initialized.
    sync_clock.initialize(&pool).await?;

    Ok((pool, sync_clock))
}
