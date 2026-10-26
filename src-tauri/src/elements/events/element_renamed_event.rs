use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;

/// Event name emitted when a `NameSource::Automatic` name follows a change to its element's content.
pub const ELEMENT_RENAMED_EVENT: &str = "elementRenamed";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementRenamedEventDto {
    pub element_id: ElementId,
    pub name: String,
}
