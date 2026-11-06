use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;
use crate::study::value_objects::due_element::DueElement;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueElementDto {
    pub element_id: ElementId,
    pub title: String,
}

impl From<DueElement> for DueElementDto {
    fn from(element: DueElement) -> Self {
        Self {
            element_id: element.element_id,
            title: element.name,
        }
    }
}
