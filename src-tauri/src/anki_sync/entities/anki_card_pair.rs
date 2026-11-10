use uuid::Uuid;

use crate::import::anki::value_objects::anki_card_id::AnkiCardId;

/// An Amber card and the Anki card it's synced with in one profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnkiCardPair {
    pub card_id: Uuid,
    pub anki_card_id: AnkiCardId,
}
