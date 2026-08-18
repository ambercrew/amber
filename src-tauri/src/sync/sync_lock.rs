use tokio::sync::Mutex;

/// Serializes `SyncEngine::sync` executions. Without this, two overlapping
/// syncs (e.g. a manual sync racing an auto-sync-on-close) each run their own
/// independent pull/push cycle with no coordination, letting their pushes
/// reach the server out of causal order — e.g. a child element's cells
/// landing before its parent folder's — which then trips FK repair into
/// treating the parent as deleted.
#[derive(Default)]
pub struct SyncLock(pub Mutex<()>);
