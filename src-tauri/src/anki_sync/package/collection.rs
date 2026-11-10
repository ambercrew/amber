use std::collections::HashMap;

use serde_json::json;

use super::database::{CardRow, CollectionDatabase, CollectionRow, NoteRow};
use super::definitions::{deck_config, decks, notetypes, stable_id};
use super::writer::AnkiPackageError;
use crate::anki_sync::entities::anki_note::AnkiNote;

const FIELD_SEPARATOR: &str = "\x1f";

/// The notes as a schema 11 collection file, ids derived from guids and deck names so they're stable.
pub(super) fn write_collection(notes: &[AnkiNote]) -> Result<Vec<u8>, AnkiPackageError> {
    let database = CollectionDatabase::create()?;
    let now = chrono::Utc::now().timestamp();
    let mut deck_ids = HashMap::new();

    for (position, note) in notes.iter().enumerate() {
        let note_id = stable_id(&note.guid);
        let deck_id = *deck_ids
            .entry(note.deck.clone())
            .or_insert_with(|| stable_id(&note.deck));
        database.insert_note(&NoteRow {
            id: note_id,
            guid: &note.guid,
            notetype_id: note.notetype.id(),
            modified: note.modified,
            tags: format!(" {} ", note.tags.join(" ")),
            // The Amber ID and other hidden fields follow the visible ones.
            fields: note
                .fields
                .iter()
                .chain([&note.guid])
                .chain(&note.hidden_fields)
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join(FIELD_SEPARATOR),
        })?;
        for &ord in &note.card_ords {
            database.insert_card(&CardRow {
                id: stable_id(&format!("{}-{ord}", note.guid)),
                note_id,
                deck_id,
                ord,
                modified: note.modified,
                due: position,
            })?;
        }
    }

    database.insert_collection(&CollectionRow {
        now,
        notetypes: notetypes().to_string(),
        decks: decks(deck_ids.keys(), now).to_string(),
        deck_configs: json!({ "1": deck_config(now) }).to_string(),
    })?;
    Ok(database.into_bytes()?)
}
