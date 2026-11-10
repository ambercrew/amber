use uuid::Uuid;

use crate::import::anki::value_objects::anki_card_id::AnkiCardId;

/// An Amber card imported from Anki, and the Anki card it came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnkiCardLink {
    pub card_id: Uuid,
    pub anki_card_id: AnkiCardId,
}
