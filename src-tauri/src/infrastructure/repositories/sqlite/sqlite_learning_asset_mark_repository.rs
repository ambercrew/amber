use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::learning_asset_mark::LearningAssetMark;
use crate::elements::repositories::learning_asset_mark_repository::LearningAssetMarkRepository;
use crate::elements::value_objects::mark_slot::MarkSlot;
use crate::elements::value_objects::reading_position::ReadingPosition;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteLearningAssetMarkRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl LearningAssetMarkRepository for SqliteLearningAssetMarkRepository {
    async fn get_all(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetMark>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT slot as "slot!: i64", split as "split!: i64", block as "block!: i64"
            FROM learning_asset_marks
            WHERE learning_asset_id = $1
            ORDER BY slot"#,
            learning_asset_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        // A synced row with an out-of-range slot can't come from this app, so it's skipped.
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let slot = MarkSlot::try_from(u8::try_from(row.slot).ok()?).ok()?;
                Some(LearningAssetMark {
                    learning_asset_id,
                    slot,
                    anchor: ReadingPosition {
                        split: row.split as u32,
                        block: row.block as u32,
                    },
                })
            })
            .collect())
    }

    async fn set(&self, mark: LearningAssetMark) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let slot = mark.slot.get();
        sqlx::query!(
            "INSERT INTO learning_asset_marks (learning_asset_id, slot, split, block) VALUES ($1, $2, $3, $4) \
             ON CONFLICT (learning_asset_id, slot) DO UPDATE SET split = excluded.split, block = excluded.block",
            mark.learning_asset_id.hyphenated(),
            slot,
            mark.anchor.split,
            mark.anchor.block,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn clear(&self, learning_asset_id: Uuid, slot: MarkSlot) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let slot = slot.get();
        sqlx::query!(
            "DELETE FROM learning_asset_marks WHERE learning_asset_id = $1 AND slot = $2",
            learning_asset_id.hyphenated(),
            slot,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, injector_scope::InjectorScope, register_scope};

    use crate::{
        elements::{
            entities::{folder::Folder, learning_asset::LearningAsset},
            repositories::{
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{
                element_id::ElementId, learning_asset_content::LearningAssetContent, meta::Meta,
            },
        },
        infrastructure::repositories::sqlite::{
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn LearningAssetMarkRepository,
            SqliteLearningAssetMarkRepository
        );
        injector
    }

    fn make_meta(id: ElementId) -> Meta {
        Meta {
            element_id: id,
            name: "test".into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            study_profile_id: None,
            bibliographical_source_id: None,
            derived_from: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    /// Creates a learning asset under a fresh folder and returns its id.
    async fn create_learning_asset(scope: &InjectorScope<'_>) -> Uuid {
        let folder = Folder {
            meta: make_meta(ElementId::Folder(Uuid::new_v4())),
        };
        let learning_asset = LearningAsset {
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..make_meta(ElementId::LearningAsset(Uuid::new_v4()))
            },
            read_point: ReadingPosition::default(),
        };
        let id = learning_asset.meta.element_id.id();
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();
        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(learning_asset, LearningAssetContent::Extracted(Vec::new()))
            .await
            .unwrap();
        id
    }

    fn mark(learning_asset_id: Uuid, slot: u8, split: u32, block: u32) -> LearningAssetMark {
        LearningAssetMark {
            learning_asset_id,
            slot: MarkSlot::try_from(slot).unwrap(),
            anchor: ReadingPosition { split, block },
        }
    }

    #[tokio::test]
    async fn get_all_no_marks_returns_empty() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let repo = scope.resolve::<dyn LearningAssetMarkRepository>().await;

        // Act

        let actual = repo.get_all(id).await.unwrap();

        // Assert

        assert!(actual.is_empty());
    }

    #[tokio::test]
    async fn set_several_slots_returns_them_ordered_by_slot() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let repo = scope.resolve::<dyn LearningAssetMarkRepository>().await;

        // Act

        repo.set(mark(id, 3, 2, 4)).await.unwrap();
        repo.set(mark(id, 1, 0, 1)).await.unwrap();
        let actual = repo.get_all(id).await.unwrap();

        // Assert

        assert_eq!(vec![mark(id, 1, 0, 1), mark(id, 3, 2, 4)], actual);
    }

    #[tokio::test]
    async fn set_already_set_slot_moves_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let repo = scope.resolve::<dyn LearningAssetMarkRepository>().await;
        repo.set(mark(id, 2, 1, 1)).await.unwrap();

        // Act

        repo.set(mark(id, 2, 5, 9)).await.unwrap();
        let actual = repo.get_all(id).await.unwrap();

        // Assert

        assert_eq!(vec![mark(id, 2, 5, 9)], actual);
    }

    #[tokio::test]
    async fn clear_set_slot_removes_only_that_slot() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let repo = scope.resolve::<dyn LearningAssetMarkRepository>().await;
        repo.set(mark(id, 1, 0, 0)).await.unwrap();
        repo.set(mark(id, 2, 1, 1)).await.unwrap();

        // Act

        repo.clear(id, MarkSlot::try_from(1).unwrap())
            .await
            .unwrap();
        let actual = repo.get_all(id).await.unwrap();

        // Assert

        assert_eq!(vec![mark(id, 2, 1, 1)], actual);
    }

    #[tokio::test]
    async fn delete_learning_asset_with_marks_cascades_to_marks() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let repo = scope.resolve::<dyn LearningAssetMarkRepository>().await;
        repo.set(mark(id, 1, 0, 0)).await.unwrap();

        // Act

        scope
            .resolve::<dyn MetaRepository>()
            .await
            .delete(ElementId::LearningAsset(id))
            .await
            .unwrap();
        let actual = repo.get_all(id).await.unwrap();

        // Assert

        assert!(actual.is_empty());
    }
}
