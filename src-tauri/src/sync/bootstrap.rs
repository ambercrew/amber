use std::sync::Arc;

use injector::injector::Injector;

use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::errors::SyncError;
use crate::sync::store::SyncStore;
use crate::sync::value_objects::granularity::Granularity;

/// Every domain table synced to the cloud, paired with its tracking
/// granularity. `meta` is tracked at column granularity so that concurrent
/// edits to different fields of the same element (e.g. one device renaming
/// it while another repositions it) merge independently instead of one
/// clobbering the other; every other table is tracked at row granularity.
/// `local_configurations` is deliberately excluded — it holds per-machine
/// settings, not data meant to sync. Sync's own bookkeeping tables
/// (`sync_cells`, `sync_registry`, `sync_applying`) are never registered.
const TABLES: &[(&str, Granularity)] = &[
    ("meta", Granularity::Column),
    ("tags", Granularity::Row),
    ("tag_parents", Granularity::Row),
    ("study_profiles", Granularity::Row),
    ("bibliographical_sources", Granularity::Row),
    ("folders", Granularity::Row),
    ("learning_assets", Granularity::Row),
    ("learning_asset_splits", Granularity::Row),
    ("extracts", Granularity::Row),
    ("cards", Granularity::Row),
    ("element_tags", Granularity::Row),
    ("card_reviews", Granularity::Row),
    ("learning_asset_reviews", Granularity::Row),
    ("card_review_logs", Granularity::Row),
    ("learning_asset_review_logs", Granularity::Row),
    ("ai_chats", Granularity::Row),
    ("ai_messages", Granularity::Row),
    ("ai_message_context_snippets", Granularity::Row),
    ("saved_searches", Granularity::Row),
    ("saved_search_filters", Granularity::Row),
];

/// Registers every synced domain table for change tracking. Idempotent —
/// safe (and necessary) to call on every app start, since `register_table`
/// only (re)creates triggers and is a no-op for tables already registered at
/// the same granularity. Must run once, before the app is usable, since
/// writes to an unregistered table are never tracked for sync.
pub async fn register_sync_tables(injector: &Arc<Injector>) -> Result<(), SyncError> {
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;

    for (table, granularity) in TABLES {
        store.register_table(table, *granularity).await?;
    }

    scope.save_changes().await?;

    Ok(())
}
