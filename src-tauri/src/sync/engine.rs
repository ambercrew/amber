use async_trait::async_trait;

use crate::sync::errors::SyncError;

/// Orchestrates one full sync cycle: pulls and applies remote changes, then
/// pushes this device's pending local ones. Local mechanics live in `SyncStore`,
/// network calls in `AmberBackendClient`.
#[async_trait]
pub trait SyncEngine: Send + Sync {
    async fn sync(&self) -> Result<(), SyncError>;
}
