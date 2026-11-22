use std::sync::Arc;
use std::time::Duration;

use injector::injector::Injector;

use crate::backup::services::backup_service::{BackupService, TIME_BETWEEN_BACKUPS_IN_MINUTES};
use crate::common::utils::deferred_interval::deferred_interval;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::sync_lock::SyncLock;

/// Starts the background task that periodically ensures a backup exists.
pub fn spawn_backup_task(injector: Arc<Injector>) {
    tokio::spawn(async move {
        let mut interval = deferred_interval(
            &injector,
            Duration::from_mins(TIME_BETWEEN_BACKUPS_IN_MINUTES),
        )
        .await;

        loop {
            interval.tick().await;
            let scope = injector.start_scope();

            // Held so a backup and a sync never write at once.
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
