use serde::Serialize;

use crate::elements::services::priority_service::PriorityNeighbors;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityNeighborDto {
    pub element_id: ElementId,
    pub name: String,
}

/// The elements on either side of a position in the priority queue.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityNeighborsResponseDto {
    pub before: Option<PriorityNeighborDto>,
    pub after: Option<PriorityNeighborDto>,
}

impl From<Meta> for PriorityNeighborDto {
    fn from(meta: Meta) -> Self {
        PriorityNeighborDto {
            element_id: meta.element_id,
            name: meta.name,
        }
    }
}

impl From<PriorityNeighbors> for PriorityNeighborsResponseDto {
    fn from(neighbors: PriorityNeighbors) -> Self {
        PriorityNeighborsResponseDto {
            before: neighbors.before.map(Into::into),
            after: neighbors.after.map(Into::into),
        }
    }
}
