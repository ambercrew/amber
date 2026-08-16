use async_trait::async_trait;

use crate::sync::errors::SyncError;

/// Orchestrates one full sync cycle: pushes this device's pending local
/// changes to the backend, then pulls and applies whatever changed
/// remotely. Delegates the local mechanics to `SyncStore` and the network
/// calls to `AmberBackendClient`.
#[async_trait]
pub trait SyncEngine: Send + Sync {
    async fn sync(&self) -> Result<(), SyncError>;
}
