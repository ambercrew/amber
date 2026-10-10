use std::sync::Arc;
use std::time::Duration;

use injector::injector::Injector;

use crate::assets::services::asset_service::AssetService;
use crate::backend::clients::amber_backend_client::AmberBackendClient;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::local_configurations::repositories::local_configuration_repository::{
    LocalConfigurationRepository, LocalConfigurationRepositoryExt,
};
use crate::sync::sync_completion::SyncCompletion;
use crate::sync::sync_lock::SyncLock;

const TIME_BETWEEN_ASSET_MAINTENANCE_IN_MINUTES: u64 = 12 * 60;
const EMBEDDED_IMAGES_MIGRATED_CONFIGURATION_NAME: &str = "EMBEDDED_IMAGES_MIGRATED";

/// Moves legacy embedded `data:` images into the asset store once per device (after the
/// first sync when signed in), and periodically sweeps unreferenced assets.
pub fn spawn_asset_maintenance_task(injector: Arc<Injector>) {
    tokio::spawn(async move {
        let sync_lock = injector.start_scope().resolve::<SyncLock>().await;
        let migration_injector = injector.clone();
        let migration_sync_lock = sync_lock.clone();
        tokio::spawn(async move {
            if !embedded_images_migrated(&migration_injector).await {
                wait_for_remote_changes(&migration_injector).await;
                if migrate_embedded_images(&migration_injector, &migration_sync_lock).await {
                    mark_embedded_images_migrated(&migration_injector).await;
                }
            }
        });

        let mut interval = tokio::time::interval(Duration::from_mins(
            TIME_BETWEEN_ASSET_MAINTENANCE_IN_MINUTES,
        ));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            sweep_unreferenced_assets(&injector, &sync_lock).await;
        }
    });
}

/// A signed-in device migrates only after pulling, so its rewrite (with a fresh HLC)
/// can't beat newer edits made on another device.
async fn wait_for_remote_changes(injector: &Injector) {
    let scope = injector.start_scope();
    let signed_in = scope
        .resolve::<dyn AmberBackendClient>()
        .await
        .is_signed_in()
        .unwrap_or(true);
    if signed_in {
        scope.resolve::<SyncCompletion>().await.wait().await;
    }
}

async fn embedded_images_migrated(injector: &Injector) -> bool {
    match injector
        .start_scope()
        .resolve::<dyn LocalConfigurationRepository>()
        .await
        .get_by_name::<bool>(EMBEDDED_IMAGES_MIGRATED_CONFIGURATION_NAME)
        .await
    {
        Ok(migrated) => migrated.unwrap_or(false),
        Err(err) => {
            log::error!("An error happened when reading the embedded image migration flag {err:?}");
            false
        }
    }
}

async fn mark_embedded_images_migrated(injector: &Injector) {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LocalConfigurationRepository>()
        .await
        .set_by_name(EMBEDDED_IMAGES_MIGRATED_CONFIGURATION_NAME, &true)
        .await;
    if let Err(err) = result {
        log::error!("An error happened when setting the embedded image migration flag {err:?}");
        return;
    }
    if let Err(err) = scope.save_changes().await {
        log::error!("An error happened when saving the embedded image migration flag {err:?}");
    }
}

/// Returns whether every document migrated, so a failure is retried on the next launch.
async fn migrate_embedded_images(injector: &Injector, sync_lock: &SyncLock) -> bool {
    let documents = match injector
        .start_scope()
        .resolve::<dyn AssetService>()
        .await
        .find_documents_with_embedded_images()
        .await
    {
        Ok(documents) => documents,
        Err(err) => {
            log::error!("An error happened when finding embedded images {:?}", err);
            return false;
        }
    };

    // One transaction (and sync lock hold) per document, so a large library never
    // holds one giant write or blocks a user-triggered sync for the whole migration.
    let mut all_migrated = true;
    for document in documents {
        let _guard = sync_lock.0.lock().await;
        let scope = injector.start_scope();
        let result = scope
            .resolve::<dyn AssetService>()
            .await
            .migrate_document(document)
            .await;
        if let Err(err) = result {
            log::error!("An error happened when migrating {document:?}'s images {err:?}");
            all_migrated = false;
            continue;
        }
        if let Err(err) = scope.save_changes().await {
            log::error!("An error happened when saving {document:?}'s migrated images {err:?}");
            all_migrated = false;
        }
    }
    all_migrated
}

async fn sweep_unreferenced_assets(injector: &Injector, sync_lock: &SyncLock) {
    let _guard = sync_lock.0.lock().await;
    let scope = injector.start_scope();
    match scope
        .resolve::<dyn AssetService>()
        .await
        .sweep_unreferenced()
        .await
    {
        Ok(0) => {}
        Ok(deleted) => log::info!("Deleted {deleted} unreferenced asset(s)."),
        Err(err) => {
            log::error!("An error happened when sweeping assets {:?}", err);
            return;
        }
    }

    if let Err(err) = scope.save_changes().await {
        log::error!("An error happened when saving the asset sweep {:?}", err);
    }
}
