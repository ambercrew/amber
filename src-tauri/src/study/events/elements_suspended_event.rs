use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;

/// Event name emitted when elements are newly suspended, so a running study session can drop them.
pub const ELEMENTS_SUSPENDED_EVENT: &str = "elementsSuspended";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementsSuspendedEventDto {
    pub element_ids: Vec<ElementId>,
}
