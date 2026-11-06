use serde::{Deserialize, Serialize};

use crate::elements::value_objects::element_id::ElementId;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DropPosition {
    Before,
    After,
    Inside,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveElementRequestDto {
    pub dragged_id: ElementId,
    pub target_id: Option<ElementId>,
    pub position: DropPosition,
}

/// Where a moved element landed, so the frontend can update its tree in place.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveElementResponseDto {
    pub parent: Option<ElementId>,
    pub position: String,
    /// The target's siblings got new positions too, so the tree has to be reloaded.
    pub rebalanced: bool,
}
