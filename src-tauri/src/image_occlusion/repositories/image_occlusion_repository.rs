use async_trait::async_trait;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;

#[async_trait]
pub trait ImageOcclusionRepository: Send + Sync {
    async fn create(&self, occlusion: &ImageOcclusion) -> Result<(), RepositoryError>;

    /// Saves the shapes and mode; the image is immutable once created.
    async fn update(&self, occlusion: &ImageOcclusion) -> Result<(), RepositoryError>;

    async fn get_by_id(&self, id: Uuid) -> Result<ImageOcclusion, RepositoryError>;

    /// The occlusion already made from this image in this element, if any.
    async fn find_id_by_source(
        &self,
        parent_id: Uuid,
        image_asset_id: &AssetId,
    ) -> Result<Option<Uuid>, RepositoryError>;

    async fn link_card(&self, link: &ImageOcclusionCardLink) -> Result<(), RepositoryError>;

    async fn unlink_card(&self, card_id: Uuid) -> Result<(), RepositoryError>;

    async fn get_links(
        &self,
        occlusion_id: Uuid,
    ) -> Result<Vec<ImageOcclusionCardLink>, RepositoryError>;

    /// Linked cards that are neither trashed themselves nor inside a trashed or deleted ancestor.
    async fn get_live_linked_card_ids(
        &self,
        occlusion_id: Uuid,
    ) -> Result<Vec<Uuid>, RepositoryError>;
}
