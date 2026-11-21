use fractional_index::FractionalIndex;
use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;

/// An element due for review, with what ordering and showing the queue take,
/// so a long queue doesn't look up each element's `Meta` separately.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DueElement {
    pub element_id: ElementId,
    pub name: String,
    pub priority: FractionalIndex,
    /// A card never reviewed (or reset since), which the profile's daily new-card limit caps.
    pub is_new_card: bool,
    /// The element's own study profile and parent, so its effective profile resolves without walking from each element.
    pub study_profile_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
}
