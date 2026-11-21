use serde::Serialize;
use uuid::Uuid;

use crate::common::event_manager::EventManager;

/// Emitted when something besides the card's view changes it (e.g. an AI rewrite), so an open view reloads it.
/// Never for the editor's own saves, which it would reload under the user's cursor.
pub const CARD_CHANGED_EVENT: &str = "cardChanged";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardChangedEventDto {
    pub card_id: Uuid,
}

pub async fn emit_card_changed(event_manager: &dyn EventManager, card_id: Uuid) {
    let body = serde_json::to_value(CardChangedEventDto { card_id })
        .expect("CardChangedEventDto always serializes");
    event_manager.push(CARD_CHANGED_EVENT, body).await;
}
