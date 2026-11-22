use std::sync::Arc;

use serde::Serialize;

use crate::common::event_manager::EventManager;
use crate::elements::value_objects::element_id::ElementId;

/// Event name emitted when elements are newly suspended, so a running study session can drop them.
pub const ELEMENTS_SUSPENDED_EVENT: &str = "elementsSuspended";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementsSuspendedEventDto {
    pub element_ids: Vec<ElementId>,
}

pub async fn emit_elements_suspended(
    event_manager: &Arc<dyn EventManager>,
    element_ids: Vec<ElementId>,
) {
    let body = serde_json::to_value(ElementsSuspendedEventDto { element_ids })
        .expect("ElementsSuspendedEventDto always serializes");
    event_manager.push(ELEMENTS_SUSPENDED_EVENT, body).await;
}
