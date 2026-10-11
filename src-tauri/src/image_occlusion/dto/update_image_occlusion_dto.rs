use serde::Deserialize;
use uuid::Uuid;

use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateImageOcclusionDto {
    pub id: Uuid,
    pub shapes: Vec<OcclusionShape>,
    pub mode: OcclusionMode,
}
