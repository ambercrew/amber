use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;

/// Event name emitted when elements go to the trash, so the study queue can drop them.
pub const ELEMENTS_TRASHED_EVENT: &str = "elementsTrashed";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementsTrashedEventDto {
    /// Every element newly trashed, descendants of the trashed roots included.
    pub element_ids: Vec<ElementId>,
}
