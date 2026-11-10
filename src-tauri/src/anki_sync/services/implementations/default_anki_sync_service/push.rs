use std::collections::{BTreeMap, HashMap};

use super::export::{AnkiCardKey, Export};
use super::{AMBER_NOTES_QUERY, DefaultAnkiSyncService};
use crate::anki_sync::anki_connect::{
    cards_info, change_deck, find_notes, notes_info, suspend_cards,
};
use crate::anki_sync::entities::anki_note::AnkiNote;
use crate::anki_sync::entities::anki_notetype::AnkiNotetype;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::package::definitions::AMBER_ID_FIELD;
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;

impl DefaultAnkiSyncService {
    /// Imports the notes with Anki's own importer, which updates notes it already has when Amber's copy is
    /// newer, and moves cards whose deck changed. Returns each Anki card id.
    pub(super) async fn push_notes(
        &self,
        export: &Export,
    ) -> Result<HashMap<AnkiCardKey, AnkiCardId>, AnkiSyncError> {
        let notes = &export.notes;
        if notes.is_empty() {
            return Ok(HashMap::new());
        }
        self.import_notes(notes, &export.media).await?;

        let exported: HashMap<&str, &AnkiNote> = notes
            .iter()
            .map(|note| (note.guid.as_str(), note))
            .collect();
        let found = find_notes(self.client(), AMBER_NOTES_QUERY).await?;
        let mut cards = HashMap::new();
        let mut occlusion_notes: HashMap<AnkiNoteId, &AnkiNote> = HashMap::new();
        let mut occlusion_cards = Vec::new();
        // Anki's importer leaves an existing card in its deck, so a folder change is applied here.
        let mut moves: BTreeMap<&str, Vec<AnkiCardId>> = BTreeMap::new();
        for info in notes_info(self.client(), &found).await? {
            let guid = info.field(AMBER_ID_FIELD).unwrap_or_default();
            let Some(note) = exported.get(guid) else {
                continue;
            };
            if export.moved.contains(guid) {
                moves
                    .entry(note.deck.as_str())
                    .or_default()
                    .extend(&info.cards);
            }
            if note.notetype == AnkiNotetype::Basic {
                let key = AnkiCardKey {
                    guid: note.guid.clone(),
                    ord: 0,
                };
                cards.extend(info.cards.iter().map(|card| (key.clone(), *card)));
            } else {
                occlusion_notes.insert(info.note_id, *note);
                occlusion_cards.extend(info.cards);
            }
        }

        // Occlusion notes can have gaps in their ordinals, so each card's comes from Anki.
        let mut retired = Vec::new();
        for info in cards_info(self.client(), &occlusion_cards).await? {
            let Some(note) = occlusion_notes.get(&info.note) else {
                continue;
            };
            if note.card_ords.contains(&info.ord) {
                let key = AnkiCardKey {
                    guid: note.guid.clone(),
                    ord: info.ord,
                };
                cards.insert(key, info.card_id);
            } else {
                retired.push(info.card_id);
            }
        }
        for (deck, cards) in moves {
            change_deck(self.client(), &cards, deck).await?;
        }
        // Anki's importer never deletes a card, and AnkiConnect can't delete one without its note.
        if !retired.is_empty() {
            suspend_cards(self.client(), &retired).await?;
        }
        Ok(cards)
    }

    /// Remembers what the profile now holds.
    pub(super) async fn record_sent(
        &self,
        profile: &str,
        sent: &[ExportedNote],
        removed: &[String],
    ) -> Result<(), AnkiSyncError> {
        for note in sent {
            self.anki_sync_repository
                .save_exported_note(profile, note)
                .await?;
        }
        for guid in removed {
            self.anki_sync_repository
                .delete_exported_note(profile, guid)
                .await?;
        }
        Ok(())
    }
}
