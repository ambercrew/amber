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
    /// A card in the long-term review schedule (not new or in learning steps), which can be buried.
    pub is_review_card: bool,
    /// The image occlusion or parent extract shared with the card's siblings, which burying holds back.
    pub sibling_group: Option<Uuid>,
    /// The element's own study profile and parent, so its effective profile resolves without walking from each element.
    pub study_profile_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
}
