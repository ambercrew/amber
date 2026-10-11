use serde::Serialize;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageOcclusionResponseDto {
    pub id: Uuid,
    pub name: String,
    pub image_asset_id: AssetId,
    pub image_width: u32,
    pub image_height: u32,
    pub shapes: Vec<OcclusionShape>,
    pub mode: OcclusionMode,
}

impl From<ImageOcclusion> for ImageOcclusionResponseDto {
    fn from(occlusion: ImageOcclusion) -> Self {
        ImageOcclusionResponseDto {
            id: occlusion.id,
            name: occlusion.name,
            image_asset_id: occlusion.image_asset_id,
            image_width: occlusion.image_width,
            image_height: occlusion.image_height,
            shapes: occlusion.shapes,
            mode: occlusion.mode,
        }
    }
}
