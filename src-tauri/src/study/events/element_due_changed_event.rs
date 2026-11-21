use std::sync::Arc;

use crate::common::event_manager::EventManager;

/// Emitted when an element's schedule changes outside a study session: its due date set, finished or
/// unfinished, or its repetitions reset.
pub const ELEMENT_DUE_CHANGED_EVENT: &str = "elementDueChanged";

pub async fn emit_element_due_changed(event_manager: &Arc<dyn EventManager>) {
    event_manager
        .push(ELEMENT_DUE_CHANGED_EVENT, serde_json::Value::Null)
        .await;
}
