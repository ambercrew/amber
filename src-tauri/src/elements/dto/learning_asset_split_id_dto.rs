use serde::Deserialize;
use uuid::Uuid;

use crate::elements::value_objects::learning_asset_split_id::LearningAssetSplitId;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAssetSplitIdDto {
    pub learning_asset_id: Uuid,
    pub seq: u32,
}

impl From<LearningAssetSplitIdDto> for LearningAssetSplitId {
    fn from(dto: LearningAssetSplitIdDto) -> Self {
        LearningAssetSplitId {
            learning_asset_id: dto.learning_asset_id,
            seq: dto.seq,
        }
    }
}
