use serde::Deserialize;
use uuid::Uuid;

use crate::elements::value_objects::reading_position::ReadingPosition;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReadPointDto {
    pub learning_asset_id: Uuid,
    pub read_point: ReadingPosition,
}
