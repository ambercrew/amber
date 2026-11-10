mod database;
mod legacy;
mod notes;
mod schema18;

use std::collections::HashMap;

use super::entities::collection::Collection;
use super::entities::notetype::Notetype;
use database::{has_table, open_in_memory};

/// Notetypes and decks by id, each deck as its path.
type NotetypesAndDecks = (HashMap<i64, Notetype>, HashMap<i64, Vec<String>>);

/// Reads an Anki collection file, in either the legacy schema 11 or the current schema 18.
pub fn read_collection(bytes: Vec<u8>) -> rusqlite::Result<Collection> {
    let conn = open_in_memory(bytes)?;
    let (notetypes, decks) = if has_table(&conn, "notetypes")? {
        schema18::read_notetypes_and_decks(&conn)?
    } else {
        legacy::read_notetypes_and_decks(&conn)?
    };
    Ok(Collection {
        notetypes,
        decks,
        notes: notes::read_notes(&conn)?,
        cards: notes::read_cards(&conn)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::anki::fixtures::legacy_collection_bytes;

    #[test]
    fn read_collection_legacy_schema_reads_notetypes_decks_notes_and_cards() {
        // Arrange

        let bytes = legacy_collection_bytes();

        // Act

        let collection = read_collection(bytes).unwrap();

        // Assert

        let basic = &collection.notetypes[&10];
        assert_eq!(vec!["Front", "Back"], basic.fields);
        assert!(!basic.is_cloze);
        assert!(collection.notetypes[&20].is_cloze);
        assert_eq!(vec!["Spanish", "Verbs"], collection.decks[&2]);
        assert_eq!(vec!["vocab"], collection.notes[&100].tags);
        assert_eq!(vec!["hablar", "to speak"], collection.notes[&100].fields);
        assert_eq!(3, collection.cards.len());
    }

    #[test]
    fn read_collection_card_in_filtered_deck_uses_original_deck() {
        // Arrange

        let bytes = legacy_collection_bytes();

        // Act

        let collection = read_collection(bytes).unwrap();

        // Assert

        let filtered = collection
            .cards
            .iter()
            .find(|card| card.note_id == 200 && card.ord == 0)
            .unwrap();
        assert_eq!(2, filtered.deck_id);
    }

    #[test]
    fn read_collection_invalid_bytes_returns_error() {
        // Arrange

        let bytes = vec![0u8; 200];

        // Act

        let result = read_collection(bytes);

        // Assert

        assert!(result.is_err());
    }
}
