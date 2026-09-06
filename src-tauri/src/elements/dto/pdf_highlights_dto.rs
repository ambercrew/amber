use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfHighlightsDto {
    pub highlights_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePdfHighlightsDto {
    pub learning_asset_id: Uuid,
    pub highlights_json: String,
}
