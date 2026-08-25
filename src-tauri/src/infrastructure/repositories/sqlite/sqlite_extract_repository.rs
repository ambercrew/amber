#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::extract::Extract;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::utils::plain_text_extractor::extract_plain_text;
use crate::infrastructure::repositories::sqlite::sqlite_rows::extract_row::ExtractRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteExtractRepository {
    tx: Arc<DbTransaction>,
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl ExtractRepository for SqliteExtractRepository {
    async fn create(&self, extract: Extract) -> Result<(), RepositoryError> {
        self.meta_repository.create_meta(&extract.meta).await?;

        let uuid = extract.meta.element_id.id().hyphenated();
        let content_text = extract_plain_text(&extract.content);
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "INSERT INTO extracts (id, content, content_text, interval_multiplier) VALUES ($1, $2, $3, $4)",
            uuid,
            extract.content,
            content_text,
            extract.interval_multiplier,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<Extract>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            ExtractRow,
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
                m.modified_at as "modified_at: _",
                e.content,
                e.interval_multiplier
            FROM extracts e
            INNER JOIN meta m ON e.id = m.element_id
            WHERE m.trashed_at IS NULL
            ORDER BY m.position"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<Extract, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            ExtractRow,
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
                m.modified_at as "modified_at: _",
                e.content,
                e.interval_multiplier
            FROM extracts e
            INNER JOIN meta m ON e.id = m.element_id
            WHERE e.id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn update_content(&self, id: Uuid, content: String) -> Result<(), RepositoryError> {
        let content_text = extract_plain_text(&content);
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE extracts SET content = $1, content_text = $2 WHERE id = $3",
            content,
            content_text,
            id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn update_interval_multiplier(
        &self,
        id: Uuid,
        interval_multiplier: f32,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE extracts SET interval_multiplier = $1 WHERE id = $2",
            interval_multiplier,
            id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
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
    async fn delete_extract_with_child_extract_cascades_to_child_extract() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
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
        let parent_extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        let child_extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(parent_extract.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        extract_repo.create(parent_extract.clone()).await.unwrap();
        extract_repo.create(child_extract.clone()).await.unwrap();

        // Act

        meta_repo
            .delete(parent_extract.meta.element_id)
            .await
            .unwrap();

        // Assert

        let remaining = extract_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|e| e.meta.element_id == child_extract.meta.element_id)
        );
    }

    #[tokio::test]
    async fn delete_extract_with_card_cascades_to_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
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
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        let card = Card {
            meta: Meta {
                parent: Some(extract.meta.element_id),
                ..card_meta()
            },
            front: String::new(),
            back: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        extract_repo.create(extract.clone()).await.unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        meta_repo.delete(extract.meta.element_id).await.unwrap();

        // Assert

        let remaining = card_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|c| c.meta.element_id == card.meta.element_id)
        );
    }

    #[tokio::test]
    async fn rename_extract_valid_name_updates_name() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
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
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        extract_repo.create(extract.clone()).await.unwrap();

        // Act

        meta_repo
            .rename(extract.meta.element_id, "renamed".into())
            .await
            .unwrap();

        // Assert

        let remaining = extract_repo.get_all().await.unwrap();
        let updated = remaining
            .iter()
            .find(|e| e.meta.element_id == extract.meta.element_id)
            .unwrap();
        assert_eq!("renamed", updated.meta.name);
    }

    #[tokio::test]
    async fn exists_extract_present_returns_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
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
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..extract_meta()
            },
            content: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        extract_repo.create(extract.clone()).await.unwrap();

        // Act

        let actual = meta_repo.exists(extract.meta.element_id).await.unwrap();

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn exists_extract_absent_returns_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        // Act

        let actual = meta_repo
            .exists(ElementId::Extract(Uuid::new_v4()))
            .await
            .unwrap();

        // Assert

        assert!(!actual);
    }
}
