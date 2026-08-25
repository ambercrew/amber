use tokio::sync::Mutex;

/// Serializes `SyncEngine::sync` executions. Two overlapping syncs can push out
/// of causal order — a child's cells before its parent's — tripping FK repair
/// into treating the parent as deleted.
#[derive(Default)]
pub struct SyncLock(pub Mutex<()>);
