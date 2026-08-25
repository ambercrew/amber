use tokio::sync::Mutex;

/// Serializes `SyncEngine::sync` executions. Without this, two overlapping
/// syncs (e.g. manual vs. auto-sync-on-close) can push out of causal order —
/// e.g. a child's cells landing before its parent's — tripping FK repair into
/// treating the parent as deleted.
#[derive(Default)]
pub struct SyncLock(pub Mutex<()>);
