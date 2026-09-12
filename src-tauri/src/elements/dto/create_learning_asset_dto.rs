use serde::Deserialize;
use uuid::Uuid;

use super::create_meta_dto::CreateMetaDto;
use crate::elements::entities::learning_asset::LearningAssetType;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLearningAssetDto {
    pub id: Uuid,
    pub meta: CreateMetaDto,
    pub r#type: LearningAssetType,
    pub splits: Vec<String>,
    pub initial_priority_rank: Option<i64>,
    #[serde(default)]
    pub pdf_bytes_base64: Option<String>,
    #[serde(default)]
    pub pdf_page_count: Option<u32>,
}
