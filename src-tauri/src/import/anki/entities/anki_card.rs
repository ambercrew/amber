/// A card's sides as HTML.
pub struct AnkiCard {
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    /// The Anki card it came from.
    pub anki_card_id: i64,
}
