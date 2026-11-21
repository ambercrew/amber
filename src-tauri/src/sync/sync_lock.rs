use tokio::sync::Mutex;

/// Serializes syncs, as overlapping ones can push a child before its parent and trip FK repair. Backup
/// and trash purge take it too, or SQLite fails one writer at once with "database is locked".
#[derive(Default)]
pub struct SyncLock(pub Mutex<()>);
