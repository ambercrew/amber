use std::sync::Arc;

use crate::common::event_manager::EventManager;

/// Emitted when what's due changes outside a study session: an element's due date set, finished or
/// unfinished, its repetitions reset, or a profile change moving the new card limits.
pub const ELEMENT_DUE_CHANGED_EVENT: &str = "elementDueChanged";

pub async fn emit_element_due_changed(event_manager: &Arc<dyn EventManager>) {
    event_manager
        .push(ELEMENT_DUE_CHANGED_EVENT, serde_json::Value::Null)
        .await;
}
