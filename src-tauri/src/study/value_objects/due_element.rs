use fractional_index::FractionalIndex;

use crate::elements::value_objects::element_id::ElementId;

/// An element due for review, with what ordering and showing the queue take,
/// so a long queue doesn't look up each element's `Meta` separately.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DueElement {
    pub element_id: ElementId,
    pub name: String,
    pub priority: FractionalIndex,
}
