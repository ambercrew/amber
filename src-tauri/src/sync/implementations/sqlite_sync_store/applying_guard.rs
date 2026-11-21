use sqlx::SqliteConnection;

use crate::sync::errors::SyncError;

/// Pair with [`clear_applying`] on both the success and error paths, so a caller that doesn't roll
/// back an errored transaction still clears the guard row.
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
