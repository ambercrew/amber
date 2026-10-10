use serde::Serialize;

use crate::assets::value_objects::asset_id::AssetId;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetResponseDto {
    pub id: AssetId,
    /// The canonical `amber-asset:<id>` value to persist as an image `src`.
    pub src: String,
}

impl AssetResponseDto {
    pub fn new(id: AssetId) -> Self {
        Self { src: id.src(), id }
    }
}
