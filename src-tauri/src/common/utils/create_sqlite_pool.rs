use std::str::FromStr;

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use tokio::fs;

use crate::{SourceError, settings::value_objects::database_location::DatabaseLocation, sync};

pub async fn create_sqlite_pool_from_location(
    database_location: &DatabaseLocation,
) -> Result<SqlitePool, SourceError> {
    if let Some(parent) = database_location.get_path().parent() {
        fs::create_dir_all(parent).await?;
    }
    Ok(create_sqlite_pool(&format!("sqlite:///{}", database_location)).await?)
}

pub async fn create_sqlite_pool(url: &str) -> Result<SqlitePool, sqlx::Error> {
    sync::sql_functions::install_sync_sql_functions();

    let options = SqliteConnectOptions::from_str(url)?
        .journal_mode(SqliteJournalMode::Wal)
        .optimize_on_close(true, None)
        .foreign_keys(true)
        .synchronous(SqliteSynchronous::Normal)
        .pragma("cache_size", "-65536")
        .pragma("temp_store", "memory")
        .pragma("recursive_triggers", "true")
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new().connect_with(options).await?;
    sqlx::migrate!("./migrations/").run(&pool).await?;
    sync::sql_functions::initialize(&pool).await?;

    Ok(pool)
}
