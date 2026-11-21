use std::time::Duration;

use injector::injector::Injector;
use tokio::time::{Interval, MissedTickBehavior, interval};

use crate::backend::clients::amber_backend_client::AmberBackendClient;
use crate::settings::repositories::settings_repository::SettingsRepository;
use crate::sync::sync_completion::SyncCompletion;

/// The longest periodic work waits for a startup sync that may never come (e.g. an unverified email).
pub const STARTUP_SYNC_WAIT_CAP: Duration = Duration::from_secs(10);

/// A `period` interval whose first tick comes once the startup sync has been attempted, so the
/// work never holds the sync lock during it, or at once when no startup sync is coming.
pub async fn deferred_interval(injector: &Injector, period: Duration) -> Interval {
    wait_for_startup_sync(injector).await;
    let mut interval = interval(period);
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    interval
}

async fn wait_for_startup_sync(injector: &Injector) {
    let completion = {
        let scope = injector.start_scope();
        let signed_in = scope
            .resolve::<dyn AmberBackendClient>()
            .await
            .is_signed_in()
            .unwrap_or(false);
        let auto_sync = scope
            .resolve::<dyn SettingsRepository>()
            .await
            .get_settings()
            .await
            .auto_sync;
        if !signed_in || !auto_sync {
            return;
        }
        scope.resolve::<SyncCompletion>().await
    };

    let _ = tokio::time::timeout(STARTUP_SYNC_WAIT_CAP, completion.wait_attempted()).await;
}
