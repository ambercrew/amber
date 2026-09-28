use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::study::value_objects::learning_asset_action::LearningAssetAction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearningAssetReviewLog {
    pub id: Uuid,
    pub element_id: Option<Uuid>,
    pub reviewed_at: DateTime<Utc>,
    pub action: LearningAssetAction,
    pub duration_ms: Option<u32>,
}
