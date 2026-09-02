use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::learning_asset::{
    LearningAsset, LearningAssetContent, LearningAssetSplitId, LearningAssetSplitMeta,
    LearningAssetSplitText,
};
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::utils::plain_text_extractor::extract_plain_text;
use crate::elements::value_objects::read_point::ReadPoint;
use crate::infrastructure::repositories::sqlite::sqlite_rows::learning_asset_row::LearningAssetRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteLearningAssetRepository {
    tx: Arc<DbTransaction>,
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl LearningAssetRepository for SqliteLearningAssetRepository {
    async fn create(
        &self,
        learning_asset: LearningAsset,
        content: LearningAssetContent,
    ) -> Result<(), RepositoryError> {
        self.meta_repository
            .create_meta(&learning_asset.meta)
            .await?;

        let uuid = learning_asset.meta.element_id.id().hyphenated();
        let type_str = learning_asset.r#type.as_str();
        {
            let mut tx = self.tx.lock().await;
            let tx = tx.as_mut();
            sqlx::query!(
                "INSERT INTO learning_assets (id, readpoint_split, readpoint_block, interval_multiplier, type) VALUES ($1, $2, $3, $4, $5)",
                uuid,
                learning_asset.read_point.split,
                learning_asset.read_point.block,
                learning_asset.interval_multiplier,
                type_str,
            )
            .execute(&mut *tx)
            .await?;

            match content {
                LearningAssetContent::Extracted(splits) => {
                    for split in splits {
                        let content_text = extract_plain_text(&split.content);
                        sqlx::query!(
                            "INSERT INTO learning_asset_splits (learning_asset_id, seq, content, content_text) VALUES ($1, $2, $3, $4)",
                            uuid,
                            split.seq,
                            split.content,
                            content_text,
                        )
                        .execute(&mut *tx)
                        .await?;
                    }
                }
                LearningAssetContent::Pdf { bytes, page_count } => {
                    sqlx::query!(
                        "INSERT INTO learning_asset_pdfs (learning_asset_id, bytes, page_count) VALUES ($1, $2, $3)",
                        uuid,
                        bytes,
                        page_count,
                    )
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<LearningAsset>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            LearningAssetRow,
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
                r.readpoint_split,
                r.readpoint_block,
                r.interval_multiplier,
                r.type
            FROM learning_assets r
            INNER JOIN meta m ON r.id = m.element_id
            WHERE m.trashed_at IS NULL
            ORDER BY m.position"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(LearningAsset::from)
            .collect::<Vec<_>>())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<LearningAsset, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            LearningAssetRow,
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
                r.readpoint_split,
                r.readpoint_block,
                r.interval_multiplier,
                r.type
            FROM learning_assets r
            INNER JOIN meta m ON r.id = m.element_id
            WHERE r.id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn get_split_manifest(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetSplitMeta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT seq, LENGTH(content_text) as "char_count!: i64"
            FROM learning_asset_splits
            WHERE learning_asset_id = $1
            ORDER BY seq"#,
            learning_asset_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| LearningAssetSplitMeta {
                seq: row.seq as u32,
                char_count: row.char_count as u32,
            })
            .collect())
    }

    async fn get_split_texts(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetSplitText>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT seq, content_text
            FROM learning_asset_splits
            WHERE learning_asset_id = $1
            ORDER BY seq"#,
            learning_asset_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| LearningAssetSplitText {
                seq: row.seq as u32,
                text: row.content_text,
            })
            .collect())
    }

    async fn get_split_content(
        &self,
        split_id: LearningAssetSplitId,
    ) -> Result<String, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query!(
            "SELECT content FROM learning_asset_splits WHERE learning_asset_id = $1 AND seq = $2",
            split_id.learning_asset_id.hyphenated(),
            split_id.seq,
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.content)
    }

    async fn update_content(
        &self,
        split_id: LearningAssetSplitId,
        content: String,
    ) -> Result<(), RepositoryError> {
        let content_text = extract_plain_text(&content);
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE learning_asset_splits SET content = $1, content_text = $2 WHERE learning_asset_id = $3 AND seq = $4",
            content,
            content_text,
            split_id.learning_asset_id.hyphenated(),
            split_id.seq,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn update_read_point(
        &self,
        learning_asset_id: Uuid,
        read_point: ReadPoint,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE learning_assets SET readpoint_split = $1, readpoint_block = $2 WHERE id = $3",
            read_point.split,
            read_point.block,
            learning_asset_id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn update_interval_multiplier(
        &self,
        learning_asset_id: Uuid,
        interval_multiplier: f32,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE learning_assets SET interval_multiplier = $1 WHERE id = $2",
            interval_multiplier,
            learning_asset_id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_pdf_bytes(&self, learning_asset_id: Uuid) -> Result<Vec<u8>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            "SELECT bytes FROM learning_asset_pdfs WHERE learning_asset_id = $1",
            learning_asset_id.hyphenated(),
        )
        .fetch_one(&mut *tx)
        .await?;
        Ok(row.bytes)
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
                card::Card,
                extract::Extract,
                folder::Folder,
                learning_asset::{LearningAsset, LearningAssetSplit},
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
            sqlite_folder_repository::SqliteFolderRepository,
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

    fn split_content_json(text: &str) -> String {
        format!(
            r#"{{"root":{{"children":[{{"type":"paragraph","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
        )
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
    async fn delete_learning_asset_with_extract_cascades_to_extract() {
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
            r#type: Default::default(),
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
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        extract_repo.create(extract.clone()).await.unwrap();

        // Act

        meta_repo
            .delete(learning_asset.meta.element_id)
            .await
            .unwrap();

        // Assert

        let remaining = extract_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|e| e.meta.element_id == extract.meta.element_id)
        );
    }

    #[tokio::test]
    async fn delete_learning_asset_with_card_cascades_to_card() {
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
            read_point: ReadPoint::default(),
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
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        card_repo.create(card.clone()).await.unwrap();

        // Act

        meta_repo
            .delete(learning_asset.meta.element_id)
            .await
            .unwrap();

        // Assert

        let remaining = card_repo.get_all().await.unwrap();
        assert!(
            !remaining
                .iter()
                .any(|c| c.meta.element_id == card.meta.element_id)
        );
    }

    #[tokio::test]
    async fn rename_learning_asset_valid_name_updates_name() {
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
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();

        // Act

        meta_repo
            .rename(learning_asset.meta.element_id, "renamed".into())
            .await
            .unwrap();

        // Assert

        let remaining = learning_asset_repo.get_all().await.unwrap();
        let updated = remaining
            .iter()
            .find(|r| r.meta.element_id == learning_asset.meta.element_id)
            .unwrap();
        assert_eq!("renamed", updated.meta.name);
    }

    #[tokio::test]
    async fn exists_learning_asset_present_returns_true() {
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
            r#type: Default::default(),
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();

        // Act

        let actual = meta_repo
            .exists(learning_asset.meta.element_id)
            .await
            .unwrap();

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn exists_learning_asset_absent_returns_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;

        // Act

        let actual = meta_repo
            .exists(ElementId::LearningAsset(Uuid::new_v4()))
            .await
            .unwrap();

        // Assert

        assert!(!actual);
    }

    #[tokio::test]
    async fn get_split_manifest_multiple_splits_returns_ordered_meta_with_char_counts() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

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
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![
                    LearningAssetSplit {
                        seq: 1,
                        content: split_content_json("abcd"),
                    },
                    LearningAssetSplit {
                        seq: 0,
                        content: split_content_json("ab"),
                    },
                ]),
            )
            .await
            .unwrap();

        // Act

        let actual = learning_asset_repo
            .get_split_manifest(learning_asset.meta.element_id.id())
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec![
                LearningAssetSplitMeta {
                    seq: 0,
                    char_count: 2,
                },
                LearningAssetSplitMeta {
                    seq: 1,
                    char_count: 4,
                },
            ],
            actual
        );
    }

    #[tokio::test]
    async fn get_split_texts_multiple_splits_returns_ordered_plain_text() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

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
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![
                    LearningAssetSplit {
                        seq: 1,
                        content: split_content_json("second"),
                    },
                    LearningAssetSplit {
                        seq: 0,
                        content: split_content_json("first"),
                    },
                ]),
            )
            .await
            .unwrap();

        // Act

        let actual = learning_asset_repo
            .get_split_texts(learning_asset.meta.element_id.id())
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec![
                LearningAssetSplitText {
                    seq: 0,
                    text: "first".into(),
                },
                LearningAssetSplitText {
                    seq: 1,
                    text: "second".into(),
                },
            ],
            actual
        );
    }

    #[tokio::test]
    async fn get_split_content_existing_split_returns_content() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

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
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![LearningAssetSplit {
                    seq: 0,
                    content: "hello world".into(),
                }]),
            )
            .await
            .unwrap();

        // Act

        let actual = learning_asset_repo
            .get_split_content(LearningAssetSplitId {
                learning_asset_id: learning_asset.meta.element_id.id(),
                seq: 0,
            })
            .await
            .unwrap();

        // Assert

        assert_eq!("hello world", actual);
    }

    #[tokio::test]
    async fn update_read_point_valid_learning_asset_persists_read_point() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

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
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();

        // Act

        learning_asset_repo
            .update_read_point(
                learning_asset.meta.element_id.id(),
                ReadPoint { split: 3, block: 7 },
            )
            .await
            .unwrap();

        // Assert

        let updated = learning_asset_repo
            .get_by_id(learning_asset.meta.element_id.id())
            .await
            .unwrap();
        assert_eq!(3, updated.read_point.split);
        assert_eq!(7, updated.read_point.block);
    }

    #[tokio::test]
    async fn create_pdf_learning_asset_persists_bytes_and_page_count() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: crate::elements::entities::learning_asset::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();

        // Act

        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Pdf {
                    bytes: vec![1, 2, 3],
                    page_count: 5,
                },
            )
            .await
            .unwrap();

        // Assert

        let bytes = learning_asset_repo
            .get_pdf_bytes(learning_asset.meta.element_id.id())
            .await
            .unwrap();
        assert_eq!(vec![1, 2, 3], bytes);
    }

    #[tokio::test]
    async fn create_extracted_learning_asset_defaults_type_to_extracted() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

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
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();

        // Act

        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();

        // Assert

        let created = learning_asset_repo
            .get_by_id(learning_asset.meta.element_id.id())
            .await
            .unwrap();
        assert_eq!(
            crate::elements::entities::learning_asset::LearningAssetType::Extracted,
            created.r#type
        );
    }

    #[tokio::test]
    async fn delete_learning_asset_with_pdf_cascades_to_pdf_bytes() {
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
            r#type: crate::elements::entities::learning_asset::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Pdf {
                    bytes: vec![1, 2, 3],
                    page_count: 5,
                },
            )
            .await
            .unwrap();

        // Act

        meta_repo
            .delete(learning_asset.meta.element_id)
            .await
            .unwrap();

        // Assert

        let result = learning_asset_repo
            .get_pdf_bytes(learning_asset.meta.element_id.id())
            .await;
        assert!(result.is_err());
    }
}
