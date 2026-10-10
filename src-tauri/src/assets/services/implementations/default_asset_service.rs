use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use serde_json::Value;

use crate::assets::entities::asset::Asset;
use crate::assets::repositories::asset_repository::AssetRepository;
use crate::assets::services::asset_service::{ASSET_GC_GRACE_DAYS, AssetService};
use crate::assets::utils::asset_src::{
    collect_embedded_image_srcs, decode_image_data_uri, may_contain_embedded_images, replace_srcs,
};
use crate::assets::value_objects::asset_document::AssetDocument;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;

#[derive(ScopeInjectable)]
pub struct DefaultAssetService {
    asset_repository: Arc<dyn AssetRepository>,
    extract_repository: Arc<dyn ExtractRepository>,
    card_repository: Arc<dyn CardRepository>,
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
}

#[async_trait]
impl AssetService for DefaultAssetService {
    async fn store(&self, asset: &Asset) -> Result<(), RepositoryError> {
        self.asset_repository.insert_if_missing(asset).await
    }

    async fn create_from_data_uri(
        &self,
        data_uri: &str,
    ) -> Result<Option<AssetId>, RepositoryError> {
        let Some((mime_type, data)) = decode_image_data_uri(data_uri) else {
            return Ok(None);
        };
        let asset = Asset {
            id: AssetId::from_bytes(&data),
            mime_type,
            data,
        };
        self.store(&asset).await?;
        Ok(Some(asset.id))
    }

    async fn ingest_content(&self, content: String) -> Result<String, RepositoryError> {
        if !may_contain_embedded_images(&content) {
            return Ok(content);
        }
        let Ok(mut document) = serde_json::from_str::<Value>(&content) else {
            return Ok(content);
        };

        let mut replacements = HashMap::new();
        for src in collect_embedded_image_srcs(&document) {
            if let Some(id) = self.create_from_data_uri(&src).await? {
                replacements.insert(src, id.src());
            }
        }
        if replacements.is_empty() {
            return Ok(content);
        }

        replace_srcs(&mut document, &replacements);
        Ok(document.to_string())
    }

    async fn find_documents_with_embedded_images(
        &self,
    ) -> Result<Vec<AssetDocument>, RepositoryError> {
        let extracts = self
            .extract_repository
            .find_ids_with_embedded_images()
            .await?;
        let cards = self.card_repository.find_ids_with_embedded_images().await?;
        let splits = self
            .learning_asset_repository
            .find_split_ids_with_embedded_images()
            .await?;
        Ok(extracts
            .into_iter()
            .map(AssetDocument::Extract)
            .chain(cards.into_iter().map(AssetDocument::Card))
            .chain(splits.into_iter().map(AssetDocument::LearningAssetSplit))
            .collect())
    }

    async fn migrate_document(&self, document: AssetDocument) -> Result<(), RepositoryError> {
        match document {
            AssetDocument::Extract(id) => {
                let content = self.extract_repository.get_by_id(id).await?.content;
                let migrated = self.ingest_content(content.clone()).await?;
                if migrated != content {
                    self.extract_repository.update_content(id, migrated).await?;
                }
            }
            AssetDocument::Card(id) => {
                let card = self.card_repository.get_by_id(id).await?;
                let front = self.ingest_content(card.front.clone()).await?;
                let back = self.ingest_content(card.back.clone()).await?;
                if front != card.front || back != card.back {
                    self.card_repository.update_content(id, front, back).await?;
                }
            }
            AssetDocument::LearningAssetSplit(split_id) => {
                let content = self
                    .learning_asset_repository
                    .get_split_content(split_id)
                    .await?;
                let migrated = self.ingest_content(content.clone()).await?;
                if migrated != content {
                    self.learning_asset_repository
                        .update_content(split_id, migrated)
                        .await?;
                }
            }
        }
        Ok(())
    }

    async fn sweep_unreferenced(&self) -> Result<u64, RepositoryError> {
        self.asset_repository
            .sweep_unreferenced(ASSET_GC_GRACE_DAYS)
            .await
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::entities::card::Card;
    use crate::elements::entities::extract::Extract;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::meta::Meta;
    use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_repository::SqliteLearningAssetRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    const PNG_DATA_URI: &str = "data:image/png;base64,iVBORw0KGgo=";

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
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

    fn image_content(src: &str) -> String {
        format!(r#"{{"root":{{"children":[{{"src":"{src}","type":"image"}}]}}}}"#)
    }

    #[tokio::test]
    async fn find_documents_with_embedded_images_mixed_content_returns_only_embedding_documents() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn AssetService>().await;
        let embedding_extract = Uuid::new_v4();
        let embedding_card = Uuid::new_v4();
        let asset_src = AssetId::from_bytes(b"a").src();
        for (id, src) in [
            (embedding_extract, PNG_DATA_URI),
            (Uuid::new_v4(), &asset_src),
        ] {
            extract_repository
                .create(Extract {
                    meta: make_meta(ElementId::Extract(id)),
                    content: image_content(src),
                    interval_multiplier: 1.0,
                })
                .await
                .unwrap();
        }
        card_repository
            .create(Card {
                meta: make_meta(ElementId::Card(embedding_card)),
                front: String::new(),
                back: image_content(PNG_DATA_URI),
            })
            .await
            .unwrap();

        // Act

        let documents = service.find_documents_with_embedded_images().await.unwrap();

        // Assert

        assert_eq!(
            documents,
            vec![
                AssetDocument::Extract(embedding_extract),
                AssetDocument::Card(embedding_card)
            ]
        );
    }

    #[tokio::test]
    async fn migrate_document_card_with_embedded_images_rewrites_both_sides() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn AssetService>().await;
        let id = Uuid::new_v4();
        card_repository
            .create(Card {
                meta: make_meta(ElementId::Card(id)),
                front: image_content(PNG_DATA_URI),
                back: image_content(PNG_DATA_URI),
            })
            .await
            .unwrap();

        // Act

        service
            .migrate_document(AssetDocument::Card(id))
            .await
            .unwrap();

        // Assert

        let card = card_repository.get_by_id(id).await.unwrap();
        let expected = image_content(
            &AssetId::from_bytes(&decode_image_data_uri(PNG_DATA_URI).unwrap().1).src(),
        );
        assert_eq!(card.front, expected);
        assert_eq!(card.back, expected);
    }

    #[tokio::test]
    async fn ingest_content_embedded_images_rewrites_srcs_to_one_asset() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AssetService>().await;
        let content = format!(
            r#"{{"root":{{"children":[{{"type":"image","src":"{PNG_DATA_URI}"}},{{"type":"image","src":"{PNG_DATA_URI}"}}]}}}}"#
        );

        // Act

        let ingested = service.ingest_content(content).await.unwrap();

        // Assert

        let id = AssetId::from_bytes(&decode_image_data_uri(PNG_DATA_URI).unwrap().1);
        let expected_src = id.src();
        assert!(!ingested.contains("data:image/"));
        assert_eq!(ingested.matches(&expected_src).count(), 2);
        assert!(
            scope
                .resolve::<dyn AssetRepository>()
                .await
                .get(&id)
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn ingest_content_already_ingested_returns_content_unchanged() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AssetService>().await;
        let content = format!(r#"{{"src":"{PNG_DATA_URI}"}}"#);
        let ingested = service.ingest_content(content).await.unwrap();

        // Act

        let reingested = service.ingest_content(ingested.clone()).await.unwrap();

        // Assert

        assert_eq!(reingested, ingested);
    }

    #[tokio::test]
    async fn ingest_content_invalid_json_returns_content_unchanged() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AssetService>().await;
        let content = format!("not json {PNG_DATA_URI}");

        // Act

        let ingested = service.ingest_content(content.clone()).await.unwrap();

        // Assert

        assert_eq!(ingested, content);
    }
}
