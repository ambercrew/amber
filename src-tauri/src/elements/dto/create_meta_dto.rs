use serde::Deserialize;

use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMetaDto {
    /// `None` names the element after its content until the user renames it (see `auto_name`).
    pub name: Option<String>,
    pub parent: Option<ElementId>,
    pub origin: Origin,
}
