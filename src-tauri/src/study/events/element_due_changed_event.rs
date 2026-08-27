use std::sync::Arc;

use crate::common::event_manager::EventManager;

/// Event name emitted whenever an element's review schedule changes outside a
/// study session — its due date is set directly, it is finished or unfinished,
/// or its repetitions are reset.
pub const ELEMENT_DUE_CHANGED_EVENT: &str = "elementDueChanged";

pub async fn emit_element_due_changed(event_manager: &Arc<dyn EventManager>) {
    event_manager
        .push(ELEMENT_DUE_CHANGED_EVENT, serde_json::Value::Null)
        .await;
}
