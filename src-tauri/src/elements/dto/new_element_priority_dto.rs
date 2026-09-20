use serde::Serialize;

/// Where a not-yet-created element would land in the priority queue.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewElementPriorityResponseDto {
    /// 1-based position among `total`; 1 is the very front of the queue.
    pub position: i64,
    /// Size of the queue the element would join, itself included.
    pub total: i64,
}
