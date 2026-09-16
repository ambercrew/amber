use std::sync::Arc;
use std::time::Duration;

use injector::injector::Injector;

use crate::backup::services::backup_service::{BackupService, TIME_BETWEEN_BACKUPS_IN_MINUTES};
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::sync_lock::SyncLock;

/// Starts the background task that periodically ensures a backup exists.
pub fn spawn_backup_task(injector: Arc<Injector>) {
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(Duration::from_mins(TIME_BETWEEN_BACKUPS_IN_MINUTES));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            let scope = injector.start_scope();

            // The first tick lands on app start, right when the frontend kicks
            // off its own sync — held here so the two don't write at once.
            let sync_lock = scope.resolve::<SyncLock>().await;
            let _guard = sync_lock.0.lock().await;

            if let Err(err) = scope
                .resolve::<dyn BackupService>()
                .await
                .ensure_backup()
                .await
            {
                log::error!("An error happened when creating a backup {:?}", err);
            }

            if let Err(err) = scope.save_changes().await {
                log::error!("An error happened when saving changes for backup {:?}", err);
            }
        }
    });
}
