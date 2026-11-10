use super::anki_card::AnkiCard;
use super::anki_occlusion::AnkiOcclusion;

pub struct AnkiDeck {
    /// The deck's name split at its subdeck separators, e.g. `["Spanish", "Verbs"]`.
    pub path: Vec<String>,
    pub cards: Vec<AnkiCard>,
    pub image_occlusions: Vec<AnkiOcclusion>,
}
