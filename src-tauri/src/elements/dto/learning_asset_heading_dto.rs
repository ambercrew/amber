use serde::Serialize;

use crate::elements::value_objects::learning_asset_heading::LearningAssetHeading;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAssetHeadingDto {
    pub seq: u32,
    pub block: u32,
    pub level: u8,
    pub text: String,
}

impl From<LearningAssetHeading> for LearningAssetHeadingDto {
    fn from(heading: LearningAssetHeading) -> Self {
        LearningAssetHeadingDto {
            seq: heading.seq,
            block: heading.block,
            level: heading.level,
            text: heading.text,
        }
    }
}
