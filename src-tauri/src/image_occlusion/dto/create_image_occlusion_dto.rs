use serde::Deserialize;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::value_objects::new_card_due::NewCardDue;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;

/// `meta` applies to every generated card; its name is suffixed with the card's number.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateImageOcclusionDto {
    pub id: Uuid,
    pub meta: CreateMetaDto,
    pub image_asset_id: AssetId,
    pub image_width: u32,
    pub image_height: u32,
    pub shapes: Vec<OcclusionShape>,
    pub mode: OcclusionMode,
    /// Set by the backend only, for occlusions imported from Anki.
    #[serde(skip)]
    pub due: NewCardDue,
}
