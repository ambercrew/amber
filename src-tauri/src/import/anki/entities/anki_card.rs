use crate::import::anki::value_objects::anki_card_id::AnkiCardId;

/// A card's sides as HTML.
pub struct AnkiCard {
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    /// The Anki card it came from.
    pub anki_card_id: AnkiCardId,
}
