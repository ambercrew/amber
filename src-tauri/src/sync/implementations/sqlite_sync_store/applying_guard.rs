use sqlx::SqliteConnection;

use crate::sync::errors::SyncError;

/// `sync_applying` is a regular table created by the sync tables migration
/// (see its comment there for why it can't be a TEMP table). Callers must
/// pair this with [`clear_applying`] on both the success and error paths so
/// a caller that doesn't roll back an errored transaction still leaves this
/// row cleared.
pub(super) async fn mark_applying(tx: &mut SqliteConnection) -> Result<(), SyncError> {
    sqlx::query("INSERT INTO sync_applying(x) VALUES (1)")
        .execute(&mut *tx)
        .await?;

    Ok(())
}

pub(super) async fn clear_applying(tx: &mut SqliteConnection) -> Result<(), SyncError> {
    sqlx::query("DELETE FROM sync_applying")
        .execute(&mut *tx)
        .await?;

    Ok(())
}
