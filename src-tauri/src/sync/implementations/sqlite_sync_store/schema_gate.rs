use serde::Deserialize;
use sqlx::SqliteConnection;

use crate::generated_code::ChangeBatch;
use crate::sync::errors::SyncError;
use crate::sync::utils::merge;

/// Synced like any other table, so devices learn each other's schema with no backend support.
pub(crate) const SCHEMA_VERSIONS_TABLE: &str = "device_schema_versions";

#[derive(Deserialize)]
struct DeviceSchemaVersion {
    version: i64,
}

/// Publishes this device's latest migration. Its cell sorts before anything the app writes
/// afterwards, but not before cells a migration itself writes to a synced table.
pub(crate) async fn record_local_schema_version(
    tx: &mut SqliteConnection,
) -> Result<(), SyncError> {
    sqlx::query(
        "INSERT INTO device_schema_versions(device_id, version)
         VALUES (device_id(), (SELECT MAX(version) FROM _sqlx_migrations))
         ON CONFLICT(device_id) DO UPDATE SET version = excluded.version
         WHERE version <> excluded.version",
    )
    .execute(&mut *tx)
    .await?;

    Ok(())
}

/// Refuses a page from a device on a newer schema: this app can't be trusted to apply it.
pub(super) async fn ensure_schema_supported(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
) -> Result<(), SyncError> {
    let remote_version = batch
        .cells
        .iter()
        .filter(|cell| cell.tbl == SCHEMA_VERSIONS_TABLE && cell.col == merge::ROW_COL)
        .filter_map(|cell| cell.value.as_deref())
        .map(|value| {
            // A payload this app can't read must come from a newer one.
            serde_json::from_slice::<DeviceSchemaVersion>(value).map_or(i64::MAX, |row| row.version)
        })
        .max();

    let Some(remote_version) = remote_version else {
        return Ok(());
    };

    let local_version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&mut *tx)
        .await?;

    if remote_version > local_version {
        return Err(SyncError::AppUpdateRequired {
            local_version,
            remote_version,
        });
    }

    Ok(())
}
