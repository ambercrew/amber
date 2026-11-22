use std::sync::Arc;

use crate::sync::post_sync_task::PostSyncTask;

/// Every [`PostSyncTask`], in registration order, collected by `create_injector` since the injector binds
/// one implementation per type; this keeps `sync` independent of the modules contributing them.
pub struct PostSyncTasks(Vec<Arc<dyn PostSyncTask>>);

impl PostSyncTasks {
    pub fn new(tasks: Vec<Arc<dyn PostSyncTask>>) -> Self {
        Self(tasks)
    }

    pub fn iter(&self) -> impl Iterator<Item = &Arc<dyn PostSyncTask>> {
        self.0.iter()
    }
}
