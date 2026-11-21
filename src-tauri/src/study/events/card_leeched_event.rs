use serde::Serialize;
use uuid::Uuid;

/// Emitted when a grade makes a card a leech, so the frontend can offer to rewrite it.
pub const CARD_LEECHED_EVENT: &str = "cardLeeched";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardLeechedEventDto {
    pub card_id: Uuid,
    pub lapses: u32,
    pub suspended: bool,
    /// False for an image occlusion card, whose sides an AI text rewrite would replace.
    pub rewritable: bool,
}
