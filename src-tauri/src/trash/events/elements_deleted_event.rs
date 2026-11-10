use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;

/// Event name emitted when elements are permanently deleted from the trash.
pub const ELEMENTS_DELETED_EVENT: &str = "elementsDeleted";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementsDeletedEventDto {
    /// The deleted trash roots; their descendants went with them.
    pub element_ids: Vec<ElementId>,
}
