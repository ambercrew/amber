#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::folder::Folder;
use crate::elements::repositories::folder_repository::FolderRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::infrastructure::repositories::sqlite::sqlite_rows::folder_row::FolderRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteFolderRepository {
    tx: Arc<DbTransaction>,
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl FolderRepository for SqliteFolderRepository {
    async fn create(&self, folder: Folder) -> Result<(), RepositoryError> {
        self.meta_repository.create_meta(&folder.meta).await?;

        let uuid = folder.meta.element_id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!("INSERT INTO folders (id) VALUES ($1)", uuid)
            .execute(&mut *tx)
            .await?;

        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<Folder>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            FolderRow,
            r#"SELECT
                m.element_id as "id: _",
                m.name,
                m.position as "position: _",
                m.priority as "priority: _",
                m.parent_id as "parent_id: _",
                m.parent_type,
                m.derived_from_id as "derived_from_id: _",
                m.derived_from_type,
                m.study_profile_id as "study_profile_id: _",
                m.bibliographical_source_id as "bibliographical_source_id: _",
                m.created_at as "created_at: _",
                m.modified_at as "modified_at: _"
            FROM folders f
            INNER JOIN meta m ON f.id = m.element_id
            WHERE m.trashed_at IS NULL
            ORDER BY m.position"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<Folder, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            FolderRow,
            r#"SELECT
                m.element_id as "id: _",
                m.name,
                m.position as "position: _",
                m.priority as "priority: _",
                m.parent_id as "parent_id: _",
                m.parent_type,
                m.derived_from_id as "derived_from_id: _",
                m.derived_from_type,
                m.study_profile_id as "study_profile_id: _",
                m.bibliographical_source_id as "bibliographical_source_id: _",
                m.created_at as "created_at: _",
                m.modified_at as "modified_at: _"
            FROM folders f
            INNER JOIN meta m ON f.id = m.element_id
            WHERE f.id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::{
                card::Card, extract::Extract, folder::Folder, learning_asset::LearningAsset,
            },
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_extract_repository::SqliteExtractRepository,
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
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        injector
    }

    fn make_meta(id: ElementId) -> Meta {
        Meta {
            element_id: id,
            name: "test".into(),
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

    fn folder_meta() -> Meta {
        make_meta(ElementId::Folder(Uuid::new_v4()))
    }
    fn learning_asset_meta() -> Meta {
        make_meta(ElementId::LearningAsset(Uuid::new_v4()))
    }
    fn extract_meta() -> Meta {
        make_meta(ElementId::Extract(Uuid::new_v4()))
    }
    fn card_meta() -> Meta {
        make_meta(ElementId::Card(Uuid::new_v4()))
    }

    #[tokio::test]
    async fn delete_folder_with_child_folder_cascades_to_child_folder() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let parent = Folder {
            meta: folder_meta(),
        };
        let child = Folder {
            meta: Meta {
                parent: Some(parent.meta.element_id),
                ..folder_meta()
            },
        };
        folder_repo.create(parent.clone()).await.unwrap();
        folder_repo.create(child.clone()).await.unwrap();

        // Act

        meta_repo.delete(parent.meta.element_id).await.unwrap();

        // Assert

        let remaining = folder_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|f| f.meta.element_id == child.meta.element_id)
        );
    }

    #[tokio::test]
    async fn delete_folder_with_learning_asset_cascades_to_learning_asset() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder.clone()).await.unwrap();
        learning_asset_repo
            .create(learning_asset.clone(), Vec::new())
            .await
            .unwrap();

        // Act

        meta_repo.delete(folder.meta.element_id).await.unwrap();

        // Assert

        let remaining = learning_asset_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|r| r.meta.element_id == learning_asset.meta.element_id)
        );
    }

    #[tokio::test]
    async fn delete_folder_with_direct_extract_cascades_to_extract() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        folder_repo.create(folder.clone()).await.unwrap();
        extract_repo.create(extract.clone()).await.unwrap();

        // Act

        meta_repo.delete(folder.meta.element_id).await.unwrap();

        // Assert

        let remaining = extract_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|e| e.meta.element_id == extract.meta.element_id)
        );
    }

    #[tokio::test]
    async fn delete_folder_with_direct_card_cascades_to_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let card = Card {
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..card_meta()
            },
            front: String::new(),
            back: String::new(),
        };
        folder_repo.create(folder.clone()).await.unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        meta_repo.delete(folder.meta.element_id).await.unwrap();

        // Assert

        let remaining = card_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|c| c.meta.element_id == card.meta.element_id)
        );
    }

    #[tokio::test]
    async fn rename_folder_valid_name_updates_name() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        folder_repo.create(folder.clone()).await.unwrap();

        // Act

        meta_repo
            .rename(folder.meta.element_id, "renamed".into())
            .await
            .unwrap();

        // Assert

        let remaining = folder_repo.get_all().await.unwrap();
        let updated = remaining
            .iter()
            .find(|f| f.meta.element_id == folder.meta.element_id)
            .unwrap();
        assert_eq!("renamed", updated.meta.name);
    }

    #[tokio::test]
    async fn exists_folder_present_returns_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        folder_repo.create(folder.clone()).await.unwrap();

        // Act

        let actual = meta_repo.exists(folder.meta.element_id).await.unwrap();

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn exists_folder_absent_returns_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        // Act

        let actual = meta_repo
            .exists(ElementId::Folder(Uuid::new_v4()))
            .await
            .unwrap();

        // Assert

        assert!(!actual);
    }
}
