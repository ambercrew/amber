use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::elements::entities::learning_asset_mark::LearningAssetMark;
use crate::elements::value_objects::mark_slot::MarkSlot;
use crate::elements::value_objects::reading_position::ReadingPosition;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAssetMarkResponseDto {
    pub slot: MarkSlot,
    pub anchor: ReadingPosition,
}

impl From<LearningAssetMark> for LearningAssetMarkResponseDto {
    fn from(mark: LearningAssetMark) -> Self {
        LearningAssetMarkResponseDto {
            slot: mark.slot,
            anchor: mark.anchor,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLearningAssetMarkRequestDto {
    pub learning_asset_id: Uuid,
    pub slot: MarkSlot,
    pub anchor: ReadingPosition,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearLearningAssetMarkRequestDto {
    pub learning_asset_id: Uuid,
    pub slot: MarkSlot,
}
