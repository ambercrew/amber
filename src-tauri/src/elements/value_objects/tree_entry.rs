use fractional_index::FractionalIndex;

use crate::elements::value_objects::element_id::ElementId;

/// What the element tree shows of an element, a fraction of its `Meta` and none of its content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub element_id: ElementId,
    pub parent: Option<ElementId>,
    pub name: String,
    pub position: FractionalIndex,
}
