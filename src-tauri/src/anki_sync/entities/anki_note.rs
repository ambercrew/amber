use super::anki_notetype::AnkiNotetype;

/// A note Amber sends to Anki.
pub struct AnkiNote {
    /// Stays the same across exports, so importing again updates the note in place.
    pub guid: String,
    pub notetype: AnkiNotetype,
    pub fields: Vec<String>,
    pub tags: Vec<String>,
    /// Subdecks separated by `::`.
    pub deck: String,
    /// Unix seconds; Anki only updates a note whose incoming copy is newer.
    pub modified: i64,
    /// The notetype's hidden fields after the Amber ID.
    pub hidden_fields: Vec<String>,
    /// Ordinals of the note's cards, which can have gaps.
    pub card_ords: Vec<usize>,
}
