use serde::Serialize;

use crate::elements::services::priority_service::PriorityInfo;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityInfoResponseDto {
    /// 1-based position among all elements; 1 is the very front of the queue.
    pub position: i64,
    pub total: i64,
    /// Percentile: 0.00 (highest priority) .. 100.00 (lowest priority).
    pub percentile: f64,
}

impl From<PriorityInfo> for PriorityInfoResponseDto {
    fn from(info: PriorityInfo) -> Self {
        PriorityInfoResponseDto {
            position: info.position,
            total: info.total,
            percentile: info.percentile,
        }
    }
}
