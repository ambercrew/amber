use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::learning_asset::LearningAsset;
use crate::elements::entities::learning_asset_split::LearningAssetSplit;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::utils::heading_extractor::extract_headings;
use crate::elements::utils::plain_text_extractor::extract_plain_text;
use crate::elements::value_objects::learning_asset_content::LearningAssetContent;
use crate::elements::value_objects::learning_asset_heading::LearningAssetHeading;
use crate::elements::value_objects::learning_asset_split_id::LearningAssetSplitId;
use crate::elements::value_objects::learning_asset_split_meta::LearningAssetSplitMeta;
use crate::elements::value_objects::learning_asset_split_text::LearningAssetSplitText;
use crate::elements::value_objects::reading_position::ReadingPosition;
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
                        let content_text = extract_plain_text(split.content());
                        let content = split.content();
                        let block_count = split.block_count();
                        sqlx::query!(
                            "INSERT INTO learning_asset_splits (learning_asset_id, seq, content, content_text, block_count) VALUES ($1, $2, $3, $4, $5)",
                            uuid,
                            split.seq,
                            content,
                            content_text,
                            block_count,
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
                    sqlx::query!(
                        "INSERT INTO learning_asset_pdf_highlights (learning_asset_id) VALUES ($1)",
                        uuid,
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
                m.name_source,
                m.suspended as "suspended: bool",
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

        rows.into_iter()
            .map(|row| {
                LearningAsset::try_from(row)
                    .map_err(|err| RepositoryError::QueryFailed(Box::from(err)))
            })
            .collect::<Result<Vec<_>, _>>()
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
                m.name_source,
                m.suspended as "suspended: bool",
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

        LearningAsset::try_from(row).map_err(|err| RepositoryError::QueryFailed(Box::from(err)))
    }

    async fn get_split_manifest(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetSplitMeta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT seq as "seq!: i64", LENGTH(content_text) as "char_count!: i64", block_count
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
                block_count: row.block_count as u32,
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

    async fn get_headings(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetHeading>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT seq, content
            FROM learning_asset_splits
            WHERE learning_asset_id = $1
            ORDER BY seq"#,
            learning_asset_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .flat_map(|row| extract_headings(row.seq as u32, &row.content))
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
        learning_asset_id: Uuid,
        split: LearningAssetSplit,
    ) -> Result<(), RepositoryError> {
        let content_text = extract_plain_text(split.content());
        let content = split.content();
        let block_count = split.block_count();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "UPDATE learning_asset_splits SET content = $1, content_text = $2, block_count = $3 WHERE learning_asset_id = $4 AND seq = $5",
            content,
            content_text,
            block_count,
            learning_asset_id.hyphenated(),
            split.seq,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn find_split_ids_with_embedded_images(
        &self,
    ) -> Result<Vec<LearningAssetSplitId>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let rows = sqlx::query!(
            r#"SELECT learning_asset_id as "learning_asset_id: Hyphenated", seq
            FROM learning_asset_splits
            WHERE content LIKE '%data:image/%'"#
        )
        .fetch_all(tx.as_mut())
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| LearningAssetSplitId {
                learning_asset_id: row.learning_asset_id.into_uuid(),
                seq: row.seq as u32,
            })
            .collect())
    }

    async fn update_read_point(
        &self,
        learning_asset_id: Uuid,
        read_point: ReadingPosition,
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

    async fn get_pdf_highlights(&self, learning_asset_id: Uuid) -> Result<String, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            "SELECT highlights FROM learning_asset_pdf_highlights WHERE learning_asset_id = $1",
            learning_asset_id.hyphenated(),
        )
        .fetch_optional(&mut *tx)
        .await?;
        // Sync can deliver a PDF asset before (or without) its highlights row.
        Ok(row.map_or_else(|| "[]".to_string(), |row| row.highlights))
    }

    async fn update_pdf_highlights(
        &self,
        learning_asset_id: Uuid,
        highlights: String,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "INSERT INTO learning_asset_pdf_highlights (learning_asset_id, highlights) VALUES ($1, $2) \
             ON CONFLICT (learning_asset_id) DO UPDATE SET highlights = excluded.highlights",
            learning_asset_id.hyphenated(),
            highlights,
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
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::{
                card::Card, extract::Extract, folder::Folder, learning_asset::LearningAsset,
                learning_asset_split::LearningAssetSplit,
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
            read_point: ReadingPosition::default(),
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
            read_point: ReadingPosition::default(),
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
            read_point: ReadingPosition::default(),
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
            read_point: ReadingPosition::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![
                    LearningAssetSplit::new(1, split_content_json("abcd")),
                    LearningAssetSplit::new(0, split_content_json("ab")),
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
                    block_count: 1,
                },
                LearningAssetSplitMeta {
                    seq: 1,
                    char_count: 4,
                    block_count: 1,
                },
            ],
            actual
        );
    }

    #[tokio::test]
    async fn update_content_more_blocks_updates_manifest_block_count() {
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
            read_point: ReadingPosition::default(),
        };
        let learning_asset_id = learning_asset.meta.element_id.id();
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset,
                LearningAssetContent::Extracted(vec![LearningAssetSplit::new(
                    0,
                    split_content_json("a"),
                )]),
            )
            .await
            .unwrap();
        let paragraph = r#"{"type":"paragraph","children":[]}"#;
        let content = format!(r#"{{"root":{{"children":[{paragraph},{paragraph},{paragraph}]}}}}"#);

        // Act

        learning_asset_repo
            .update_content(learning_asset_id, LearningAssetSplit::new(0, content))
            .await
            .unwrap();
        let actual = learning_asset_repo
            .get_split_manifest(learning_asset_id)
            .await
            .unwrap();

        // Assert

        assert_eq!(3, actual[0].block_count);
    }

    #[tokio::test]
    async fn get_headings_multiple_splits_returns_headings_in_document_order() {
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
            read_point: ReadingPosition::default(),
        };
        let heading = |text: &str| {
            format!(
                r#"{{"root":{{"children":[{{"type":"paragraph","children":[]}},{{"type":"heading","tag":"h1","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
            )
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![
                    LearningAssetSplit::new(1, heading("Second")),
                    LearningAssetSplit::new(0, heading("First")),
                ]),
            )
            .await
            .unwrap();

        // Act

        let actual = learning_asset_repo
            .get_headings(learning_asset.meta.element_id.id())
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec![
                LearningAssetHeading {
                    seq: 0,
                    block: 1,
                    level: 1,
                    text: "First".into(),
                },
                LearningAssetHeading {
                    seq: 1,
                    block: 1,
                    level: 1,
                    text: "Second".into(),
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
            read_point: ReadingPosition::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![
                    LearningAssetSplit::new(1, split_content_json("second")),
                    LearningAssetSplit::new(0, split_content_json("first")),
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
            read_point: ReadingPosition::default(),
        };
        folder_repo.create(folder).await.unwrap();
        learning_asset_repo
            .create(
                learning_asset.clone(),
                LearningAssetContent::Extracted(vec![LearningAssetSplit::new(
                    0,
                    "hello world".into(),
                )]),
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
            read_point: ReadingPosition::default(),
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
                ReadingPosition { split: 3, block: 7 },
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
            r#type: crate::elements::value_objects::learning_asset_type::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
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
            read_point: ReadingPosition::default(),
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
            crate::elements::value_objects::learning_asset_type::LearningAssetType::Extracted,
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
            r#type: crate::elements::value_objects::learning_asset_type::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
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

    #[tokio::test]
    async fn create_pdf_learning_asset_defaults_highlights_to_empty_array() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: crate::elements::value_objects::learning_asset_type::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
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

        let highlights = learning_asset_repo
            .get_pdf_highlights(learning_asset.meta.element_id.id())
            .await
            .unwrap();
        assert_eq!("[]", highlights);
    }

    #[tokio::test]
    async fn update_pdf_highlights_valid_learning_asset_persists_highlights() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;

        let folder = Folder {
            meta: folder_meta(),
        };
        let learning_asset = LearningAsset {
            r#type: crate::elements::value_objects::learning_asset_type::LearningAssetType::Pdf,
            interval_multiplier: 1.2,
            meta: Meta {
                parent: Some(folder.meta.element_id),
                ..learning_asset_meta()
            },
            read_point: ReadingPosition::default(),
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

        learning_asset_repo
            .update_pdf_highlights(
                learning_asset.meta.element_id.id(),
                r#"[{"id":"h1"}]"#.into(),
            )
            .await
            .unwrap();

        // Assert

        let highlights = learning_asset_repo
            .get_pdf_highlights(learning_asset.meta.element_id.id())
            .await
            .unwrap();
        assert_eq!(r#"[{"id":"h1"}]"#, highlights);
    }
}
