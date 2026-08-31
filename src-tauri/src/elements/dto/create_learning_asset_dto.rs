use serde::Deserialize;
use uuid::Uuid;

use super::create_meta_dto::CreateMetaDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLearningAssetDto {
    pub id: Uuid,
    pub meta: CreateMetaDto,
    pub splits: Vec<String>,
    pub initial_priority_rank: Option<i64>,
}
