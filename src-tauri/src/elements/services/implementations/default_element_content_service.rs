use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::assets::services::asset_service::AssetService;
use crate::common::repository_error::RepositoryError;
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::elements::dto::update_extract_dto::UpdateExtractDto;
use crate::elements::dto::update_learning_asset_dto::UpdateLearningAssetDto;
use crate::elements::entities::learning_asset_split::LearningAssetSplit;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::services::element_content_service::ElementContentService;
use crate::elements::value_objects::learning_asset_split_id::LearningAssetSplitId;

#[derive(ScopeInjectable)]
pub struct DefaultElementContentService {
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
    extract_repository: Arc<dyn ExtractRepository>,
    card_repository: Arc<dyn CardRepository>,
    asset_service: Arc<dyn AssetService>,
}

#[async_trait]
impl ElementContentService for DefaultElementContentService {
    async fn update_learning_asset(
        &self,
        dto: UpdateLearningAssetDto,
    ) -> Result<(), RepositoryError> {
        let content = self.asset_service.ingest_content(dto.content).await?;
        let split_id: LearningAssetSplitId = dto.split_id.into();
        self.learning_asset_repository
            .update_content(
                split_id.learning_asset_id,
                LearningAssetSplit::new(split_id.seq, content),
            )
            .await
    }

    async fn update_extract(&self, dto: UpdateExtractDto) -> Result<(), RepositoryError> {
        let content = self.asset_service.ingest_content(dto.content).await?;
        self.extract_repository
            .update_content(dto.id, content)
            .await
    }

    async fn update_card(&self, dto: UpdateCardDto) -> Result<(), RepositoryError> {
        let front = self.asset_service.ingest_content(dto.front).await?;
        let back = self.asset_service.ingest_content(dto.back).await?;
        self.card_repository
            .update_content(dto.id, front, back)
            .await
    }
}
