use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::elements::services::element_creation_service::ElementCreationError;
use crate::image_occlusion::dto::create_image_occlusion_dto::CreateImageOcclusionDto;
use crate::image_occlusion::dto::update_image_occlusion_dto::UpdateImageOcclusionDto;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::services::occlusion_card_content_builder::OcclusionCardContentBuilderError;
use crate::sync::errors::SyncError;
use crate::trash::services::trash_service::TrashServiceError;

/// Owns an occlusion and keeps one card per target (mask or group) in sync with its shapes.
#[async_trait]
pub trait ImageOcclusionService: Send + Sync {
    /// None when the occlusion isn't on this device (e.g. not synced yet).
    async fn find(&self, id: Uuid) -> Result<Option<ImageOcclusion>, ImageOcclusionError>;

    /// The occlusion already made from this image in this element, so occluding it again edits that one.
    async fn find_by_source(
        &self,
        parent_id: Uuid,
        image_asset_id: AssetId,
    ) -> Result<Option<ImageOcclusion>, ImageOcclusionError>;

    /// Whether the occlusion existed and was deleted, as opposed to not having synced here yet.
    async fn was_deleted(&self, id: Uuid) -> Result<bool, ImageOcclusionError>;

    async fn create(&self, dto: CreateImageOcclusionDto) -> Result<(), ImageOcclusionError>;

    /// Creates cards for new targets and trashes cards whose target was removed;
    /// cards for unchanged targets keep their review history. No masks left removes the occlusion.
    async fn update(&self, dto: UpdateImageOcclusionDto) -> Result<(), ImageOcclusionError>;
}

#[derive(Debug, Error)]
pub enum ImageOcclusionError {
    #[error("An image occlusion needs at least one mask")]
    NoTargets,

    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ElementCreation(#[from] ElementCreationError),

    #[error(transparent)]
    Trash(#[from] TrashServiceError),

    #[error(transparent)]
    CardContent(#[from] OcclusionCardContentBuilderError),

    #[error(transparent)]
    Sync(#[from] SyncError),
}
