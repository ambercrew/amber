use std::sync::Arc;

use injector::injector::Injector;
use sqlx::SqlitePool;

use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::errors::SyncError;
use crate::sync::implementations::sqlite_sync_store::register::register_table;
use crate::sync::store::SyncStore;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::fk_policy::FkPolicy;
use crate::sync::value_objects::granularity::Granularity;
use crate::sync::value_objects::table_sync_config::TableSyncConfig;

/// Every domain table synced to the cloud, paired with its tracking
/// granularity and its foreign-key repair policies. `meta` is tracked at
/// column granularity so that concurrent edits to different fields of the
/// same element (e.g. one device renaming it while another repositions it)
/// merge independently instead of one clobbering the other; every other
/// table is tracked at row granularity. `local_configurations` is
/// deliberately excluded — it holds per-machine settings, not data meant to
/// sync. Sync's own bookkeeping tables (`sync_cells`, `sync_registry`,
/// `sync_applying`, `sync_fk_policies`) are never registered.
///
/// FK policies mirror this schema's `ON DELETE` semantics (`SET NULL` FKs →
/// `FkPolicy::SetNull`, `CASCADE` FKs → `FkPolicy::DiscardRow`) plus a few
/// references that are only enforced by hand-written triggers rather than a
/// SQL `FOREIGN KEY` (`meta.parent_id`/`derived_from_id`, and each element
/// table's `id` back to `meta.element_id`) — see the FK repair pass in
/// `apply::apply_remote` (`is_last_page`) for why these still need an
/// explicit policy despite having no SQL-level constraint to violate.
fn table_configs() -> Vec<TableSyncConfig> {
    vec![
        TableSyncConfig {
            name: "meta",
            granularity: Granularity::Column,
            fk_constraints: vec![
                FkConstraint::new(
                    "study_profile_id",
                    "study_profiles",
                    "id",
                    FkPolicy::SetNull,
                ),
                FkConstraint::new(
                    "bibliographical_source_id",
                    "bibliographical_sources",
                    "id",
                    FkPolicy::SetNull,
                ),
                FkConstraint::new("parent_id", "meta", "element_id", FkPolicy::DiscardRow),
                FkConstraint::new("derived_from_id", "meta", "element_id", FkPolicy::SetNull),
            ],
        },
        TableSyncConfig {
            name: "tags",
            granularity: Granularity::Row,
            fk_constraints: vec![],
        },
        TableSyncConfig {
            name: "tag_parents",
            granularity: Granularity::Row,
            fk_constraints: vec![
                FkConstraint::new("tag_id", "tags", "name", FkPolicy::DiscardRow),
                FkConstraint::new("parent_tag_id", "tags", "name", FkPolicy::DiscardRow),
            ],
        },
        TableSyncConfig {
            name: "study_profiles",
            granularity: Granularity::Row,
            fk_constraints: vec![],
        },
        TableSyncConfig {
            name: "bibliographical_sources",
            granularity: Granularity::Row,
            fk_constraints: vec![],
        },
        TableSyncConfig {
            name: "folders",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "id",
                "meta",
                "element_id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "learning_assets",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "id",
                "meta",
                "element_id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "learning_asset_splits",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "learning_asset_id",
                "learning_assets",
                "id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "extracts",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "id",
                "meta",
                "element_id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "cards",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "id",
                "meta",
                "element_id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "element_tags",
            granularity: Granularity::Row,
            fk_constraints: vec![
                FkConstraint::new("element_id", "meta", "element_id", FkPolicy::DiscardRow),
                FkConstraint::new("tag_id", "tags", "name", FkPolicy::DiscardRow),
            ],
        },
        TableSyncConfig {
            name: "card_reviews",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "card_id",
                "cards",
                "id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "learning_asset_reviews",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "element_id",
                "meta",
                "element_id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "card_review_logs",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "card_id",
                "cards",
                "id",
                FkPolicy::SetNull,
            )],
        },
        TableSyncConfig {
            name: "learning_asset_review_logs",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "element_id",
                "meta",
                "element_id",
                FkPolicy::SetNull,
            )],
        },
        TableSyncConfig {
            name: "ai_chats",
            granularity: Granularity::Row,
            fk_constraints: vec![],
        },
        TableSyncConfig {
            name: "ai_messages",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "ai_chat_id",
                "ai_chats",
                "id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "ai_message_context_snippets",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "ai_message_id",
                "ai_messages",
                "id",
                FkPolicy::DiscardRow,
            )],
        },
        TableSyncConfig {
            name: "saved_searches",
            granularity: Granularity::Row,
            fk_constraints: vec![],
        },
        TableSyncConfig {
            name: "saved_search_filters",
            granularity: Granularity::Row,
            fk_constraints: vec![FkConstraint::new(
                "saved_search_id",
                "saved_searches",
                "id",
                FkPolicy::DiscardRow,
            )],
        },
    ]
}

/// Registers every synced domain table for change tracking. Idempotent —
/// safe (and necessary) to call on every app start, since `register_table`
/// only (re)creates triggers and FK policies, and is a no-op for tables
/// already registered at the same granularity. Must run once, before the app
/// is usable, since writes to an unregistered table are never tracked for
/// sync.
pub async fn register_sync_tables(injector: &Arc<Injector>) -> Result<(), SyncError> {
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;

    for config in table_configs() {
        store
            .register_table(config.name, config.granularity, &config.fk_constraints)
            .await?;
    }

    scope.save_changes().await?;

    Ok(())
}

/// Same as [`register_sync_tables`], but runs directly against `pool`
/// instead of going through a DI scope's [`SyncStore`]. Used when the active
/// database has just been swapped to `pool` (see
/// `DatabaseConnectionManager::connect_to_database`/`move_database_to`):
/// registration must happen against the *new* database, but any DI scope
/// currently in flight already holds a transaction checked out from the
/// *old* pool, so it can't be used here — this opens its own transaction on
/// `pool` instead.
pub async fn register_sync_tables_on_pool(pool: &SqlitePool) -> Result<(), SyncError> {
    let mut tx = pool.begin().await?;

    for config in table_configs() {
        register_table(
            &mut tx,
            config.name,
            config.granularity,
            &config.fk_constraints,
        )
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
