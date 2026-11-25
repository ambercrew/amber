use std::sync::Arc;
use std::time::Duration;

use injector::injector::Injector;

use crate::common::utils::deferred_interval::deferred_interval;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::settings::repositories::settings_repository::SettingsRepository;
use crate::sync::sync_lock::SyncLock;
use crate::sync::utils::unapplied_changes::has_unapplied_remote_changes;
use crate::trash::services::trash_service::{TIME_BETWEEN_TRASH_PURGES_IN_MINUTES, TrashService};

/// Starts the trash retention purge background task, which first runs after the startup sync.
pub fn spawn_trash_purge_task(injector: Arc<Injector>) {
    tokio::spawn(async move {
        let mut interval = deferred_interval(
            &injector,
            Duration::from_mins(TIME_BETWEEN_TRASH_PURGES_IN_MINUTES),
        )
        .await;

        loop {
            interval.tick().await;
            let scope = injector.start_scope();

            // Held so a purge and a sync never write at once.
            let sync_lock = scope.resolve::<SyncLock>().await;
            let _guard = sync_lock.0.lock().await;
            if has_unapplied_remote_changes(&scope).await {
                log::info!(
                    "Skipping the trash purge until a sync applies the changes it left staged."
                );
                continue;
            }

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
