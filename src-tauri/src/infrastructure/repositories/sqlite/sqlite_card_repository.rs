#[cfg(test)]
use crate::elements::value_objects::reading_position::ReadingPosition;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::card::Card;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::utils::plain_text_extractor::extract_plain_text;
use crate::infrastructure::repositories::sqlite::sqlite_rows::card_row::CardRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteCardRepository {
    tx: Arc<DbTransaction>,
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl CardRepository for SqliteCardRepository {
    async fn create(&self, card: Card) -> Result<(), RepositoryError> {
        self.meta_repository.create_meta(&card.meta).await?;

        let uuid = card.meta.element_id.id().hyphenated();
        let front_text = extract_plain_text(&card.front);
        let back_text = extract_plain_text(&card.back);
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "INSERT INTO cards (id, front, back, front_text, back_text) VALUES ($1, $2, $3, $4, $5)",
            uuid,
            card.front,
            card.back,
            front_text,
            back_text,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<Card>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            CardRow,
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
                m.name_source,
                m.suspended as "suspended: bool",
                c.front,
                c.back
            FROM cards c
            INNER JOIN meta m ON c.id = m.element_id
            WHERE m.trashed_at IS NULL
            ORDER BY m.position"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<Card, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            CardRow,
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
                m.name_source,
                m.suspended as "suspended: bool",
                c.front,
                c.back
            FROM cards c
            INNER JOIN meta m ON c.id = m.element_id
            WHERE c.id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn update_content(
        &self,
        id: Uuid,
        front: String,
        back: String,
    ) -> Result<(), RepositoryError> {
        let front_text = extract_plain_text(&front);
        let back_text = extract_plain_text(&back);
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE cards SET front = $1, back = $2, front_text = $3, back_text = $4 WHERE id = $5",
            front,
            back,
            front_text,
            back_text,
            id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_content_modified_at(
        &self,
        id: Uuid,
    ) -> Result<Option<DateTime<Utc>>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let modified = sqlx::query_scalar!(
            r#"SELECT content_modified_at as "modified: DateTime<Utc>" FROM cards WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(tx.as_mut())
        .await?;
        Ok(modified)
    }

    async fn find_ids_with_embedded_images(&self) -> Result<Vec<Uuid>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let ids = sqlx::query_scalar!(
            r#"SELECT id as "id: Hyphenated" FROM cards
            WHERE front LIKE '%data:image/%' OR back LIKE '%data:image/%'"#
        )
        .fetch_all(tx.as_mut())
        .await?;
        Ok(ids.into_iter().map(Hyphenated::into_uuid).collect())
    }
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::{card::Card, folder::Folder, learning_asset::LearningAsset},
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{
                element_id::ElementId, learning_asset_content::LearningAssetContent, meta::Meta,
            },
        },
        infrastructure::repositories::sqlite::{
            sqlite_extract_repository::SqliteExtractRepository,
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

    fn folder_meta() -> Meta {
        make_meta(ElementId::Folder(Uuid::new_v4()))
    }
    fn learning_asset_meta() -> Meta {
        make_meta(ElementId::LearningAsset(Uuid::new_v4()))
    }
    fn card_meta() -> Meta {
        make_meta(ElementId::Card(Uuid::new_v4()))
    }

    async fn created_card(scope: &injector::injector_scope::InjectorScope<'_>) -> Uuid {
        let card = Card {
            meta: card_meta(),
            front: String::new(),
            back: String::new(),
        };
        let id = card.meta.element_id.id();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        card_repo.create(card).await.unwrap();
        id
    }

    #[tokio::test]
    async fn update_content_changed_front_records_when_it_was_saved() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = created_card(&scope).await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let before = Utc::now() - chrono::Duration::seconds(1);

        // Act

        card_repo
            .update_content(id, "front".into(), String::new())
            .await
            .unwrap();

        // Assert

        let saved = card_repo.get_content_modified_at(id).await.unwrap();
        assert!(saved.is_some_and(|saved| saved >= before));
    }

    #[tokio::test]
    async fn update_content_while_cloud_sync_applies_leaves_saved_time_alone() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = created_card(&scope).await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let tx = scope.resolve::<DbTransaction>().await;
        sqlx::query("INSERT INTO sync_applying(x) VALUES (1)")
            .execute(tx.lock().await.as_mut())
            .await
            .unwrap();

        // Act

        card_repo
            .update_content(id, "front".into(), String::new())
            .await
            .unwrap();

        // Assert

        assert_eq!(None, card_repo.get_content_modified_at(id).await.unwrap());
    }

    #[tokio::test]
    async fn delete_card_valid_id_removes_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
        };
        let card = Card {
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..card_meta()
            },
            front: String::new(),
            back: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, LearningAssetContent::Extracted(Vec::new()))
            .await
            .unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        meta_repo.delete(card.meta.element_id).await.unwrap();

        // Assert

        let remaining = card_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|c| c.meta.element_id == card.meta.element_id)
        );
    }

    #[tokio::test]
    async fn rename_card_valid_name_updates_name() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
        };
        let card = Card {
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..card_meta()
            },
            front: String::new(),
            back: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, LearningAssetContent::Extracted(Vec::new()))
            .await
            .unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        meta_repo
            .rename(card.meta.element_id, "renamed".into())
            .await
            .unwrap();

        // Assert

        let remaining = card_repo.get_all().await.unwrap();
        let updated = remaining
            .iter()
            .find(|c| c.meta.element_id == card.meta.element_id)
            .unwrap();
        assert_eq!("renamed", updated.meta.name);
    }

    #[tokio::test]
    async fn exists_card_present_returns_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
        };
        let card = Card {
            meta: Meta {
                parent: Some(learning_asset.meta.element_id),
                ..card_meta()
            },
            front: String::new(),
            back: String::new(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(learning_asset, LearningAssetContent::Extracted(Vec::new()))
            .await
            .unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        let actual = meta_repo.exists(card.meta.element_id).await.unwrap();

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn exists_card_absent_returns_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        // Act

        let actual = meta_repo
            .exists(ElementId::Card(Uuid::new_v4()))
            .await
            .unwrap();

        // Assert

        assert!(!actual);
    }
}
