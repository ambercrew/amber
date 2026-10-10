use std::sync::Arc;

use injector::injector::Injector;
use sqlx::SqlitePool;

use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::errors::SyncError;
use crate::sync::implementations::sqlite_sync_store::register::{register_table, set_delete_guard};
use crate::sync::store::SyncStore;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::fk_policy::FkPolicy;
use crate::sync::value_objects::granularity::Granularity;
use crate::sync::value_objects::table_sync_config::TableSyncConfig;

/// Claims expire after the GC grace period (`ASSET_GC_GRACE_DAYS`), so an abandoned one can't block sweeps forever.
const ASSETS_DELETE_GUARD: &str = "EXISTS (SELECT 1 FROM element_assets WHERE asset_id = ?1)
    OR EXISTS (SELECT 1 FROM asset_claims WHERE asset_id = ?1 AND claimed_at > datetime('now', '-14 days'))";

/// Every domain table synced to the cloud, paired with its tracking granularity
/// and FK repair policies. `meta` uses column granularity so concurrent edits to
/// different fields of the same element merge independently; everything else is
/// row granularity. `local_configurations` is per-machine and excluded, as are
/// sync's own bookkeeping tables and the locally derived `element_assets`/`asset_gc`/`asset_claims`.
///
/// FK policies mirror the schema's `ON DELETE` semantics (`SET NULL` →
/// `FkPolicy::SetNull`, `CASCADE` → `FkPolicy::DiscardRow`), plus references
/// enforced only by triggers (`meta.parent_id`/`derived_from_id`, each element
/// table's `id` back to `meta.element_id`) that the FK repair pass still needs
/// an explicit policy for.
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
            delete_guard: None,
        },
        // Column granularity: row granularity serializes rows as JSON, which can't hold BLOBs.
        TableSyncConfig {
            name: "assets",
            granularity: Granularity::Column,
            fk_constraints: vec![],
            // Refuses another device's sweep while this device references or recently claimed the asset.
            delete_guard: Some(ASSETS_DELETE_GUARD),
        },
        TableSyncConfig {
            name: "tags",
            granularity: Granularity::Row,
            fk_constraints: vec![],
            delete_guard: None,
        },
        TableSyncConfig {
            name: "tag_parents",
            granularity: Granularity::Row,
            fk_constraints: vec![
                FkConstraint::new("tag_id", "tags", "name", FkPolicy::DiscardRow),
                FkConstraint::new("parent_tag_id", "tags", "name", FkPolicy::DiscardRow),
            ],
            delete_guard: None,
        },
        TableSyncConfig {
            name: "study_profiles",
            granularity: Granularity::Row,
            fk_constraints: vec![],
            delete_guard: None,
        },
        TableSyncConfig {
            name: "bibliographical_sources",
            granularity: Granularity::Row,
            fk_constraints: vec![],
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
        },
        TableSyncConfig {
            name: "learning_asset_pdfs",
            granularity: Granularity::Column,
            fk_constraints: vec![FkConstraint::new(
                "learning_asset_id",
                "learning_assets",
                "id",
                FkPolicy::DiscardRow,
            )],
            delete_guard: None,
        },
        TableSyncConfig {
            name: "learning_asset_pdf_highlights",
            granularity: Granularity::Column,
            fk_constraints: vec![FkConstraint::new(
                "learning_asset_id",
                "learning_assets",
                "id",
                FkPolicy::DiscardRow,
            )],
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
        },
        TableSyncConfig {
            name: "element_tags",
            granularity: Granularity::Row,
            fk_constraints: vec![
                FkConstraint::new("element_id", "meta", "element_id", FkPolicy::DiscardRow),
                FkConstraint::new("tag_id", "tags", "name", FkPolicy::DiscardRow),
            ],
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
        },
        TableSyncConfig {
            name: "ai_chats",
            granularity: Granularity::Row,
            fk_constraints: vec![],
            delete_guard: None,
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
            delete_guard: None,
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
            delete_guard: None,
        },
        TableSyncConfig {
            name: "saved_searches",
            granularity: Granularity::Row,
            fk_constraints: vec![],
            delete_guard: None,
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
            delete_guard: None,
        },
    ]
}

/// Registers every synced domain table for change tracking. Idempotent, and
/// must run before the app is usable: writes to an unregistered table are
/// never tracked.
pub async fn register_sync_tables(injector: &Arc<Injector>) -> Result<(), SyncError> {
    let scope = injector.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;

    for config in table_configs() {
        store
            .register_table(config.name, config.granularity, &config.fk_constraints)
            .await?;
        store
            .set_delete_guard(config.name, config.delete_guard)
            .await?;
    }

    scope.save_changes().await?;

    Ok(())
}

/// Same as [`register_sync_tables`], but runs directly against `pool` instead of
/// a DI scope's [`SyncStore`]. Needed right after the active database is swapped
/// to `pool`, since an in-flight scope still holds a transaction on the old one.
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
        set_delete_guard(&mut tx, config.name, config.delete_guard).await?;
    }

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::assets::entities::asset::Asset;
    use crate::assets::repositories::asset_repository::AssetRepository;
    use crate::assets::services::asset_service::ASSET_GC_GRACE_DAYS;
    use crate::assets::value_objects::asset_id::AssetId;
    use crate::generated_code::{CellChange, ChangeBatch};
    use crate::infrastructure::value_objects::db_transaction::DbTransaction;
    use crate::sync::hlc::{DeviceId, Hlc, wall_time_ms};
    use crate::sync::utils::merge;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn insert_asset(tx: &DbTransaction, id: &str, referenced: bool) {
        let mut tx = tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query("INSERT INTO assets (id, mime_type, byte_size, data) VALUES ($1, 'image/png', 1, x'01')")
            .bind(id)
            .execute(&mut *tx)
            .await
            .unwrap();
        if referenced {
            sqlx::query("INSERT INTO extracts (id, content) VALUES ($1, $2)")
                .bind(uuid::Uuid::new_v4().hyphenated())
                .bind(format!(r#"{{"src":"amber-asset:{id}"}}"#))
                .execute(&mut *tx)
                .await
                .unwrap();
        }
    }

    async fn mark_seen_unreferenced(tx: &DbTransaction, id: &str) {
        let mut tx = tx.lock().await;
        sqlx::query(
            "INSERT INTO asset_gc (asset_id, unreferenced_since) VALUES ($1, datetime('now'))",
        )
        .bind(id)
        .execute(tx.as_mut())
        .await
        .unwrap();
    }

    async fn asset_exists(tx: &DbTransaction, id: &str) -> bool {
        let mut tx = tx.lock().await;
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM assets WHERE id = $1)")
            .bind(id)
            .fetch_one(tx.as_mut())
            .await
            .unwrap()
    }

    async fn claim(tx: &DbTransaction, id: &str, days_ago: u32) {
        let mut tx = tx.lock().await;
        sqlx::query(
            "INSERT INTO asset_claims (asset_id, claimed_at) VALUES ($1, datetime('now', $2))",
        )
        .bind(id)
        .bind(format!("-{days_ago} days"))
        .execute(tx.as_mut())
        .await
        .unwrap();
    }

    async fn bookkeeping_rows(tx: &DbTransaction, id: &str) -> i64 {
        let mut tx = tx.lock().await;
        sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM asset_gc WHERE asset_id = $1)
                + (SELECT COUNT(*) FROM asset_claims WHERE asset_id = $1)",
        )
        .bind(id)
        .fetch_one(tx.as_mut())
        .await
        .unwrap()
    }

    fn remote_asset_cell(
        id: &str,
        col: &str,
        value: Option<&[u8]>,
        physical_ms: u64,
    ) -> CellChange {
        let hlc = Hlc::new(physical_ms, 0, DeviceId::from_name("remote-device"));
        CellChange {
            tbl: "assets".to_string(),
            row_id: serde_json::json!([id]).to_string(),
            col: col.to_string(),
            value: value.map(<[u8]>::to_vec),
            hlc: hlc.format(),
            device_id: "remote-device".to_string(),
        }
    }

    /// Every non-key column of an asset, as a device staging it would push them.
    fn asset_column_cells(id: &str, physical_ms: u64) -> Vec<CellChange> {
        [
            ("mime_type", b"image/png".as_slice()),
            ("byte_size", b"1"),
            ("created_at", b"2026-01-01 00:00:00"),
            ("data", b"\x01"),
        ]
        .into_iter()
        .map(|(col, value)| remote_asset_cell(id, col, Some(value), physical_ms))
        .collect()
    }

    fn asset_tombstone(id: &str) -> CellChange {
        remote_asset_cell(id, merge::DELETED_COL, None, wall_time_ms() + 1_000)
    }

    async fn register_assets_table(store: &dyn SyncStore) {
        let config = table_configs()
            .into_iter()
            .find(|config| config.name == "assets")
            .unwrap();
        store
            .register_table(config.name, config.granularity, &config.fk_constraints)
            .await
            .unwrap();
        store
            .set_delete_guard(config.name, config.delete_guard)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn table_configs_assets_remote_delete_refuses_only_referenced_or_recently_claimed_assets()
    {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        insert_asset(&tx, "referenced", true).await;
        insert_asset(&tx, "claimed", false).await;
        insert_asset(&tx, "claim-expiring", false).await;
        insert_asset(&tx, "claim-expired", false).await;
        insert_asset(&tx, "swept", false).await;
        insert_asset(&tx, "never-swept", false).await;
        claim(&tx, "claimed", 0).await;
        claim(&tx, "claim-expiring", ASSET_GC_GRACE_DAYS - 1).await;
        claim(&tx, "claim-expired", ASSET_GC_GRACE_DAYS + 1).await;
        mark_seen_unreferenced(&tx, "swept").await;
        let ids = [
            "referenced",
            "claimed",
            "claim-expiring",
            "claim-expired",
            "swept",
            "never-swept",
        ];

        // Act

        store
            .apply_remote(
                ChangeBatch {
                    cells: ids.iter().map(|id| asset_tombstone(id)).collect(),
                },
                true,
            )
            .await
            .unwrap();

        // Assert

        let mut kept = Vec::new();
        for id in ids {
            if asset_exists(&tx, id).await {
                kept.push(id);
            }
        }
        assert_eq!(kept, vec!["referenced", "claimed", "claim-expiring"]);
    }

    #[tokio::test]
    async fn table_configs_assets_remote_delete_after_insert_if_missing_keeps_asset() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        let asset = Asset {
            id: AssetId::from_bytes(b"pasted"),
            mime_type: "image/png".to_string(),
            data: vec![1],
        };
        scope
            .resolve::<dyn AssetRepository>()
            .await
            .insert_if_missing(&asset)
            .await
            .unwrap();

        // Act

        store
            .apply_remote(
                ChangeBatch {
                    cells: vec![asset_tombstone(asset.id.as_str())],
                },
                true,
            )
            .await
            .unwrap();

        // Assert

        assert!(asset_exists(&tx, asset.id.as_str()).await);
    }

    #[tokio::test]
    async fn table_configs_assets_fresh_device_pulling_asset_and_its_delete_restages_nothing() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        let ms = wall_time_ms() + 1_000;
        let mut cells = asset_column_cells("swept", ms);
        cells.push(remote_asset_cell("swept", merge::DELETED_COL, None, ms + 1));

        // Act

        store
            .apply_remote(ChangeBatch { cells }, true)
            .await
            .unwrap();

        // Assert

        assert!(!asset_exists(&tx, "swept").await);
        assert!(
            store
                .changes_since_last_push()
                .await
                .unwrap()
                .cells
                .is_empty()
        );
    }

    #[tokio::test]
    async fn table_configs_assets_remote_delete_followed_by_newer_restage_in_same_page_keeps_asset()
    {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        insert_asset(&tx, "restaged", false).await;
        mark_seen_unreferenced(&tx, "restaged").await;
        let ms = wall_time_ms() + 1_000;
        let mut cells = vec![remote_asset_cell("restaged", merge::DELETED_COL, None, ms)];
        cells.extend(asset_column_cells("restaged", ms + 1));

        // Act

        store
            .apply_remote(ChangeBatch { cells }, true)
            .await
            .unwrap();

        // Assert

        assert!(asset_exists(&tx, "restaged").await);
    }

    #[tokio::test]
    async fn table_configs_assets_remote_delete_arriving_after_newer_restage_keeps_asset() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        let ms = wall_time_ms() + 1_000;
        let mut cells = asset_column_cells("restaged", ms + 1);
        cells.push(remote_asset_cell("restaged", merge::DELETED_COL, None, ms));

        // Act

        store
            .apply_remote(ChangeBatch { cells }, true)
            .await
            .unwrap();

        // Assert

        assert!(asset_exists(&tx, "restaged").await);
    }

    #[tokio::test]
    async fn table_configs_assets_accepted_remote_delete_clears_local_bookkeeping() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        let tx = scope.resolve::<DbTransaction>().await;
        insert_asset(&tx, "swept", false).await;
        mark_seen_unreferenced(&tx, "swept").await;
        claim(&tx, "swept", ASSET_GC_GRACE_DAYS + 1).await;

        // Act

        store
            .apply_remote(
                ChangeBatch {
                    cells: vec![asset_tombstone("swept")],
                },
                true,
            )
            .await
            .unwrap();

        // Assert

        assert!(!asset_exists(&tx, "swept").await);
        assert_eq!(bookkeeping_rows(&tx, "swept").await, 0);
    }

    #[tokio::test]
    async fn table_configs_assets_remote_delete_before_referencing_content_in_same_page_keeps_asset()
     {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        register_assets_table(store.as_ref()).await;
        store
            .register_table("extracts", Granularity::Row, &[])
            .await
            .unwrap();
        let tx = scope.resolve::<DbTransaction>().await;
        insert_asset(&tx, "swept", false).await;
        mark_seen_unreferenced(&tx, "swept").await;
        let extract_id = uuid::Uuid::new_v4().hyphenated().to_string();
        let row = serde_json::json!({
            "id": extract_id,
            "content": r#"{"src":"amber-asset:swept"}"#,
            "content_text": "",
            "interval_multiplier": 1.2,
        });
        let referencing_content = CellChange {
            tbl: "extracts".to_string(),
            row_id: serde_json::json!([extract_id]).to_string(),
            col: merge::ROW_COL.to_string(),
            value: Some(serde_json::to_vec(&row).unwrap()),
            ..asset_tombstone("swept")
        };

        // Act

        store
            .apply_remote(
                ChangeBatch {
                    cells: vec![asset_tombstone("swept"), referencing_content],
                },
                true,
            )
            .await
            .unwrap();

        // Assert

        assert!(asset_exists(&tx, "swept").await);
    }
}
