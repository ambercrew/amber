use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::elements::dto::update_extract_dto::UpdateExtractDto;
use crate::elements::dto::update_learning_asset_dto::UpdateLearningAssetDto;

/// The single write path for edited element content, so embedded images always become assets.
#[async_trait]
pub trait ElementContentService: Send + Sync {
    async fn update_learning_asset(
        &self,
        dto: UpdateLearningAssetDto,
    ) -> Result<(), RepositoryError>;
    async fn update_extract(&self, dto: UpdateExtractDto) -> Result<(), RepositoryError>;
    async fn update_card(&self, dto: UpdateCardDto) -> Result<(), RepositoryError>;
}
