use serde::Serialize;

use crate::elements::value_objects::learning_asset_split_text::LearningAssetSplitText;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAssetSplitTextDto {
    pub seq: u32,
    pub text: String,
}

impl From<LearningAssetSplitText> for LearningAssetSplitTextDto {
    fn from(text: LearningAssetSplitText) -> Self {
        LearningAssetSplitTextDto {
            seq: text.seq,
            text: text.text,
        }
    }
}
