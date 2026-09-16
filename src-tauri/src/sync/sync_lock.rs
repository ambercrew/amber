use tokio::sync::Mutex;

/// Serializes `SyncEngine::sync` executions. Two overlapping syncs can push out
/// of causal order — a child's cells before its parent's — tripping FK repair
/// into treating the parent as deleted.
///
/// The background maintenance tasks (backup, trash purge) take it too: their
/// writes would otherwise race a sync cycle's, and SQLite fails the second
/// writer's deferred transaction with "database is locked" straight away
/// instead of honouring `busy_timeout`.
#[derive(Default)]
pub struct SyncLock(pub Mutex<()>);
