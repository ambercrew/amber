use serde::Serialize;

use crate::elements::value_objects::learning_asset_split_meta::LearningAssetSplitMeta;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAssetSplitMetaDto {
    pub seq: u32,
    pub char_count: u32,
    pub block_count: u32,
}

impl From<LearningAssetSplitMeta> for LearningAssetSplitMetaDto {
    fn from(meta: LearningAssetSplitMeta) -> Self {
        LearningAssetSplitMetaDto {
            seq: meta.seq,
            char_count: meta.char_count,
            block_count: meta.block_count,
        }
    }
}
