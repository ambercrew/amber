use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::assets::entities::asset::Asset;
use crate::assets::repositories::asset_repository::AssetRepository;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteAssetRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl AssetRepository for SqliteAssetRepository {
    async fn insert_if_missing(&self, asset: &Asset) -> Result<(), RepositoryError> {
        let id = asset.id.as_str();
        let byte_size = asset.data.len() as i64;
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // Writes first, so a deferred transaction takes the write lock (waiting on busy_timeout)
        // before reading. The claim makes the `assets` delete guard refuse remote sweeps.
        sqlx::query!(
            "INSERT INTO asset_claims (asset_id, claimed_at) VALUES ($1, datetime('now'))
            ON CONFLICT (asset_id) DO UPDATE SET claimed_at = excluded.claimed_at",
            id
        )
        .execute(&mut *tx)
        .await?;
        // Restarts the local grace period of a reused asset.
        sqlx::query!("DELETE FROM asset_gc WHERE asset_id = $1", id)
            .execute(&mut *tx)
            .await?;

        let exists = sqlx::query_scalar!(
            r#"SELECT EXISTS (SELECT 1 FROM assets WHERE id = $1) AS "exists!: bool""#,
            id
        )
        .fetch_one(&mut *tx)
        .await?;
        // Skips binding the blob just to hit an existing row.
        if !exists {
            sqlx::query!(
                "INSERT INTO assets (id, mime_type, byte_size, data) VALUES ($1, $2, $3, $4)",
                id,
                asset.mime_type,
                byte_size,
                asset.data,
            )
            .execute(&mut *tx)
            .await?;
        }
        Ok(())
    }

    async fn get(&self, id: &AssetId) -> Result<Option<Asset>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let id_str = id.as_str();
        let row = sqlx::query!("SELECT mime_type, data FROM assets WHERE id = $1", id_str)
            .fetch_optional(&mut *tx)
            .await?;

        Ok(row.map(|row| Asset {
            id: id.clone(),
            mime_type: row.mime_type,
            data: row.data,
        }))
    }

    async fn sweep_unreferenced(&self, grace_days: u32) -> Result<u64, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            "DELETE FROM asset_gc WHERE asset_id IN (SELECT asset_id FROM element_assets)"
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            "INSERT OR IGNORE INTO asset_gc (asset_id, unreferenced_since)
            SELECT a.id, datetime('now') FROM assets a
            WHERE NOT EXISTS (SELECT 1 FROM element_assets ea WHERE ea.asset_id = a.id)"
        )
        .execute(&mut *tx)
        .await?;

        // Synced: a device still using the asset refuses the delete (see `assets` in `sync/bootstrap.rs`).
        let modifier = format!("-{grace_days} days");
        let deleted = sqlx::query!(
            "DELETE FROM assets WHERE id IN (
                SELECT asset_id FROM asset_gc WHERE unreferenced_since < datetime('now', $1)
            )",
            modifier
        )
        .execute(&mut *tx)
        .await?
        .rows_affected();

        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use injector::injector_scope::InjectorScope;
    use uuid::Uuid;

    use crate::sync::store::SyncStore;
    use crate::sync::value_objects::granularity::Granularity;
    use crate::test_utils::create_test_injector;

    use super::*;

    /// A real asset id per readable test label.
    fn asset_id(label: &str) -> AssetId {
        AssetId::from_bytes(label.as_bytes())
    }

    fn make_asset(label: &str) -> Asset {
        Asset {
            id: asset_id(label),
            mime_type: "image/png".to_string(),
            data: vec![1, 2, 3],
        }
    }

    async fn insert_extract(tx: &DbTransaction, id: Uuid, content: &str) {
        let mut tx = tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query("INSERT INTO extracts (id, content) VALUES ($1, $2)")
            .bind(id.hyphenated())
            .bind(content)
            .execute(&mut *tx)
            .await
            .unwrap();
    }

    async fn age_gc_entries(tx: &DbTransaction, days: u32) {
        let mut tx = tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query("UPDATE asset_gc SET unreferenced_since = datetime('now', $1)")
            .bind(format!("-{days} days"))
            .execute(&mut *tx)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn insert_if_missing_same_id_twice_keeps_single_row() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let asset = make_asset("a");

        // Act

        repository.insert_if_missing(&asset).await.unwrap();
        repository.insert_if_missing(&asset).await.unwrap();

        // Assert

        assert_eq!(repository.get(&asset_id("a")).await.unwrap(), Some(asset));
    }

    #[tokio::test]
    async fn sweep_unreferenced_within_grace_period_keeps_asset() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        repository
            .insert_if_missing(&make_asset("a"))
            .await
            .unwrap();

        // Act

        let deleted = repository.sweep_unreferenced(14).await.unwrap();

        // Assert

        assert_eq!(deleted, 0);
        assert!(repository.get(&asset_id("a")).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn sweep_unreferenced_past_grace_period_deletes_only_unreferenced_assets() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        repository
            .insert_if_missing(&make_asset("kept"))
            .await
            .unwrap();
        repository
            .insert_if_missing(&make_asset("stale"))
            .await
            .unwrap();
        insert_extract(
            &tx,
            Uuid::new_v4(),
            &format!(
                r#"{{"root":{{"children":[{{"type":"image","src":"{}"}}]}}}}"#,
                asset_id("kept").src()
            ),
        )
        .await;
        repository.sweep_unreferenced(14).await.unwrap();
        age_gc_entries(&tx, 15).await;

        // Act

        let deleted = repository.sweep_unreferenced(14).await.unwrap();

        // Assert

        assert_eq!(deleted, 1);
        assert!(repository.get(&asset_id("kept")).await.unwrap().is_some());
        assert!(repository.get(&asset_id("stale")).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn sweep_unreferenced_asset_referenced_again_resets_grace_period() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        repository
            .insert_if_missing(&make_asset("a"))
            .await
            .unwrap();
        repository.sweep_unreferenced(14).await.unwrap();
        age_gc_entries(&tx, 15).await;
        insert_extract(
            &tx,
            Uuid::new_v4(),
            &format!(r#"{{"src":"{}"}}"#, asset_id("a").src()),
        )
        .await;

        // Act

        let deleted = repository.sweep_unreferenced(14).await.unwrap();

        // Assert

        assert_eq!(deleted, 0);
        assert!(repository.get(&asset_id("a")).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn insert_if_missing_reused_stale_asset_resets_grace_period() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        let asset = make_asset("a");
        repository.insert_if_missing(&asset).await.unwrap();
        repository.sweep_unreferenced(14).await.unwrap();
        age_gc_entries(&tx, 15).await;

        // Act

        repository.insert_if_missing(&asset).await.unwrap();

        // Assert

        assert_eq!(repository.sweep_unreferenced(14).await.unwrap(), 0);
        assert!(repository.get(&asset_id("a")).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn sweep_unreferenced_past_grace_period_clears_deleted_assets_bookkeeping() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        repository
            .insert_if_missing(&make_asset("a"))
            .await
            .unwrap();
        repository.sweep_unreferenced(14).await.unwrap();
        age_gc_entries(&tx, 15).await;

        // Act

        repository.sweep_unreferenced(14).await.unwrap();

        // Assert

        let mut tx = tx.lock().await;
        let remaining: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM asset_gc) + (SELECT COUNT(*) FROM asset_claims)",
        )
        .fetch_one(tx.as_mut())
        .await
        .unwrap();
        assert_eq!(remaining, 0);
    }

    async fn referenced_asset_ids(tx: &DbTransaction) -> Vec<String> {
        let mut tx = tx.lock().await;
        sqlx::query_scalar("SELECT DISTINCT asset_id FROM element_assets ORDER BY asset_id")
            .fetch_all(tx.as_mut())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn learning_asset_splits_update_one_split_keeps_other_splits_references() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let id = Uuid::new_v4().hyphenated().to_string();
        {
            let mut tx = tx.lock().await;
            let tx = tx.as_mut();
            sqlx::query("INSERT INTO learning_assets (id, type) VALUES ($1, 'extracted')")
                .bind(&id)
                .execute(&mut *tx)
                .await
                .unwrap();
            for (seq, label) in [(0, "first"), (1, "second")] {
                sqlx::query("INSERT INTO learning_asset_splits (learning_asset_id, seq, content) VALUES ($1, $2, $3)")
                    .bind(&id)
                    .bind(seq)
                    .bind(format!(r#"{{"src":"{}"}}"#, asset_id(label).src()))
                    .execute(&mut *tx)
                    .await
                    .unwrap();
            }
        }

        // Act

        {
            let mut tx = tx.lock().await;
            sqlx::query("UPDATE learning_asset_splits SET content = '{}' WHERE learning_asset_id = $1 AND seq = 0")
                .bind(&id)
                .execute(tx.as_mut())
                .await
                .unwrap();
        }

        // Assert

        assert_eq!(
            referenced_asset_ids(&tx).await,
            vec![asset_id("second").to_string()]
        );
    }

    async fn register_assets_for_sync(scope: &InjectorScope<'_>) {
        scope
            .resolve::<dyn SyncStore>()
            .await
            .register_table("assets", Granularity::Column, &[])
            .await
            .unwrap();
    }

    async fn asset_cell_columns(tx: &DbTransaction) -> Vec<String> {
        let mut tx = tx.lock().await;
        sqlx::query_scalar("SELECT col FROM sync_cells WHERE tbl = 'assets' ORDER BY col")
            .fetch_all(tx.as_mut())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn sweep_unreferenced_past_grace_period_stages_only_tombstone() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        register_assets_for_sync(&scope).await;
        let repository = scope.resolve::<dyn AssetRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        repository
            .insert_if_missing(&make_asset("a"))
            .await
            .unwrap();
        repository.sweep_unreferenced(14).await.unwrap();
        age_gc_entries(&tx, 15).await;

        // Act

        repository.sweep_unreferenced(14).await.unwrap();

        // Assert

        assert!(repository.get(&asset_id("a")).await.unwrap().is_none());
        assert_eq!(asset_cell_columns(&tx).await, vec!["__deleted"]);
    }
}
