use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

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

/// Opens `url` with its own [`SyncClock`], registered on every connection so triggers issue HLCs under
/// this database's device id, and returned to pass through DI (`DbPool`) rather than held globally.
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
        // Wait for another writer (e.g. startup's sync registration overlapping an early query)
        // instead of failing at once with "database is locked".
        .busy_timeout(Duration::from_secs(10))
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

    // Only once the migrations created the sync tables it seeds from; until then the SQL functions
    // report sync isn't initialized.
    sync_clock.initialize(&pool).await?;

    Ok((pool, sync_clock))
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use sqlx::migrate::Migrator;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::sync::hlc::{DeviceId, Hlc};

    const SLIM_SYNC_CELLS_VERSION: i64 = 20;

    async fn migrate_up_to(pool: &SqlitePool, version: i64) {
        let mut migrator: Migrator = sqlx::migrate!("./migrations/");
        migrator.migrations = Cow::Owned(
            migrator
                .migrations
                .iter()
                .filter(|migration| migration.version <= version)
                .cloned()
                .collect(),
        );
        migrator.run(pool).await.unwrap();
    }

    async fn insert_old_cell(pool: &SqlitePool, tbl: &str, id: &str, col: &str, hlc: &Hlc) {
        sqlx::query(
            "INSERT INTO sync_cells(tbl, row_id, col, value, hlc, device_id)
             VALUES (?1, json_array(?2), ?3, CAST(?4 AS BLOB), ?5, ?6)",
        )
        .bind(tbl)
        .bind(id)
        .bind(col)
        .bind(format!("{id}.{col}"))
        .bind(hlc.format())
        .bind(hlc.device_id.to_string())
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn slim_sync_cells_migration_cell_log_keeps_metadata_and_only_unwritten_rows_values() {
        // Arrange

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate_up_to(&pool, SLIM_SYNC_CELLS_VERSION - 1).await;
        let local = DeviceId::from_name("local");
        let remote = DeviceId::from_name("remote");
        sqlx::query("INSERT INTO local_configurations(name, value) VALUES ('sync_device_id', ?1)")
            .bind(local.to_string())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO meta(element_id, element_type, name, position, priority)
             VALUES ('written', 'folder', 'test', x'80', x'80')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // An old trigger writing the columns the migration drops.
        sqlx::query(
            "CREATE TRIGGER sync_tags_ai AFTER INSERT ON tags BEGIN
                INSERT INTO sync_cells(tbl, row_id, col, value, hlc, device_id)
                VALUES ('tags', json_array(NEW.name), '__row', NULL, '', '');
             END",
        )
        .execute(&pool)
        .await
        .unwrap();
        let local_hlc = Hlc::new(1_700_000_000_123, 0x1F, local);
        let remote_hlc = Hlc::new(1_700_000_000_456, 2, remote);
        insert_old_cell(&pool, "meta", "written", "name", &local_hlc).await;
        insert_old_cell(&pool, "meta", "unwritten", "name", &remote_hlc).await;
        insert_old_cell(&pool, "meta", "unwritten", "__deleted", &remote_hlc).await;
        insert_old_cell(&pool, "tags", "absent", "__row", &remote_hlc).await;

        // Act

        migrate_up_to(&pool, SLIM_SYNC_CELLS_VERSION).await;

        // Assert

        let cells: Vec<(String, String, String, Vec<u8>, bool)> = sqlx::query_as(
            "SELECT tbl, row_id, col, hlc, is_remote FROM sync_cells ORDER BY tbl, row_id, col",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        let cell = |tbl: &str, id: &str, col: &str, hlc: &Hlc, is_remote: bool| {
            let row_id = format!("[\"{id}\"]");
            (tbl.into(), row_id, col.into(), hlc.to_bytes(), is_remote)
        };
        assert_eq!(
            vec![
                cell("meta", "unwritten", "__deleted", &remote_hlc, true),
                cell("meta", "unwritten", "name", &remote_hlc, true),
                cell("meta", "written", "name", &local_hlc, false),
                cell("tags", "absent", "__row", &remote_hlc, true),
            ],
            cells
        );
        let pending: Vec<(String, String, String, Vec<u8>)> =
            sqlx::query_as("SELECT tbl, row_id, col, value FROM sync_pending_cells")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            vec![(
                "meta".to_string(),
                "[\"unwritten\"]".to_string(),
                "name".to_string(),
                b"unwritten.name".to_vec()
            )],
            pending
        );
        let triggers: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'sync_tags_ai'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(0, triggers);
    }

    #[tokio::test]
    async fn slim_sync_cells_migration_modified_at_triggers_skip_while_applying() {
        // Arrange

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate_up_to(&pool, SLIM_SYNC_CELLS_VERSION).await;
        sqlx::query(
            "INSERT INTO bibliographical_sources(id, modified_at, title, type)
             VALUES ('applied', '2000-01-01', 'Old', 'book'), ('local', '2000-01-01', 'Old', 'book')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Act

        for sql in [
            "INSERT INTO sync_applying(x) VALUES (1)",
            "UPDATE bibliographical_sources SET title = 'New' WHERE id = 'applied'",
            "DELETE FROM sync_applying",
            "UPDATE bibliographical_sources SET title = 'New' WHERE id = 'local'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }

        // Assert

        let modified: Vec<(String, String)> =
            sqlx::query_as("SELECT id, modified_at FROM bibliographical_sources ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            ("applied".to_string(), "2000-01-01".to_string()),
            modified[0]
        );
        assert_ne!("2000-01-01", modified[1].1);
    }
}
