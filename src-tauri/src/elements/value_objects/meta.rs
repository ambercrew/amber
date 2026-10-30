use chrono::{DateTime, Utc};
use fractional_index::FractionalIndex;
use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::name_source::NameSource;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    pub element_id: ElementId,
    pub name: String,
    pub name_source: NameSource,
    /// Keeps the element out of the review queue while set.
    pub suspended: bool,
    pub parent: Option<ElementId>,
    pub position: FractionalIndex,
    /// Global ordering across all elements, independent of `position` (which
    /// only orders siblings in the sidebar tree). Drives the priority queue.
    pub priority: FractionalIndex,
    /// The element this one was created from, one hop up the derivation chain.
    /// Independent of `parent`, which is the element's place in the sidebar tree.
    pub derived_from: Option<ElementId>,
    pub study_profile_id: Option<Uuid>,
    pub bibliographical_source_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}
