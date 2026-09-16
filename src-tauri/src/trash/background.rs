use std::sync::Arc;
use std::time::Duration;

use injector::injector::Injector;

use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::settings::repositories::settings_repository::SettingsRepository;
use crate::sync::sync_lock::SyncLock;
use crate::trash::services::trash_service::{TIME_BETWEEN_TRASH_PURGES_IN_MINUTES, TrashService};

/// Starts the trash retention purge background task, which also runs once
/// right away.
pub fn spawn_trash_purge_task(injector: Arc<Injector>) {
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(Duration::from_mins(TIME_BETWEEN_TRASH_PURGES_IN_MINUTES));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            let scope = injector.start_scope();

            // The first tick lands on app start, right when the frontend kicks
            // off its own sync — held here so the two don't write at once.
            let sync_lock = scope.resolve::<SyncLock>().await;
            let _guard = sync_lock.0.lock().await;

            let retention_days = scope
                .resolve::<dyn SettingsRepository>()
                .await
                .get_settings()
                .await
                .trash_retention_days;

            match scope
                .resolve::<dyn TrashService>()
                .await
                .purge_expired(retention_days)
                .await
            {
                Ok(0) => continue,
                Ok(purged) => log::info!("Purged {purged} expired element(s) from trash."),
                Err(err) => {
                    log::error!("An error happened when purging the trash {:?}", err);
                    continue;
                }
            }

            if let Err(err) = scope.save_changes().await {
                log::error!(
                    "An error happened when saving changes for the trash purge {:?}",
                    err
                );
            }
        }
    });
}
