use std::sync::Arc;

use crate::sync::post_sync_task::PostSyncTask;

/// Every [`PostSyncTask`] the sync engine should run, in registration order.
///
/// The injector binds one implementation per type, so tasks are collected into
/// this wrapper by the composition root (`create_injector`) instead of being
/// resolved individually by the engine. That also keeps `sync` free of any
/// dependency on the domain modules that contribute tasks.
pub struct PostSyncTasks(Vec<Arc<dyn PostSyncTask>>);

impl PostSyncTasks {
    pub fn new(tasks: Vec<Arc<dyn PostSyncTask>>) -> Self {
        Self(tasks)
    }

    pub fn iter(&self) -> impl Iterator<Item = &Arc<dyn PostSyncTask>> {
        self.0.iter()
    }
}
