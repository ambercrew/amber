use serde::Serialize;

use crate::image_occlusion::dto::image_occlusion_response_dto::ImageOcclusionResponseDto;

/// An occlusion by id, telling one that hasn't synced here yet from one that's gone for good.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ImageOcclusionLookupDto {
    Found {
        occlusion: ImageOcclusionResponseDto,
    },
    NotSynced,
    Deleted,
}
