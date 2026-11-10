use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
#[cfg(test)]
use mockall::automock;
use uuid::Uuid;

use crate::anki_sync::entities::anki_card_pair::AnkiCardPair;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::entities::synced_schedule::SyncedSchedule;
use crate::common::repository_error::RepositoryError;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;

/// Each Anki profile's sync state: what it was last sent, which cards it pairs, and the user's choices.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait AnkiSyncRepository: Send + Sync {
    async fn get_exported_notes(&self, profile: &str)
    -> Result<Vec<ExportedNote>, RepositoryError>;

    async fn save_exported_note(
        &self,
        profile: &str,
        note: &ExportedNote,
    ) -> Result<(), RepositoryError>;

    async fn delete_exported_note(&self, profile: &str, guid: &str) -> Result<(), RepositoryError>;

    async fn get_last_synced(
        &self,
        profile: &str,
    ) -> Result<Option<DateTime<Utc>>, RepositoryError>;

    async fn set_last_synced(
        &self,
        profile: &str,
        synced_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;

    /// Whether to import each top-level deck the user decided on, by name.
    async fn get_deck_choices(
        &self,
        profile: &str,
    ) -> Result<HashMap<String, bool>, RepositoryError>;

    async fn save_deck_choice(
        &self,
        profile: &str,
        deck: &str,
        import: bool,
    ) -> Result<(), RepositoryError>;

    /// The cards the profile held at its last sync.
    async fn get_paired_cards(&self, profile: &str) -> Result<Vec<AnkiCardPair>, RepositoryError>;

    /// Each paired card's due days as of the profile's last sync.
    async fn get_synced_schedules(
        &self,
        profile: &str,
    ) -> Result<HashMap<AnkiCardId, SyncedSchedule>, RepositoryError>;

    /// Replaces the profile's pairs, each with its due days from `schedules`.
    async fn replace_paired_cards(
        &self,
        profile: &str,
        pairs: &[AnkiCardPair],
        schedules: &HashMap<AnkiCardId, SyncedSchedule>,
    ) -> Result<(), RepositoryError>;

    /// Whether the card came from Anki and a profile's sync keeps it paired there, so it takes the note's
    /// edits; a card imported from a package Anki doesn't hold has no pair.
    async fn is_synced_import(&self, card_id: Uuid) -> Result<bool, RepositoryError>;

    /// The Anki cards the importer left out of the profile's decks.
    async fn get_skipped_cards(&self, profile: &str) -> Result<Vec<AnkiCardId>, RepositoryError>;

    async fn add_skipped_cards(
        &self,
        profile: &str,
        anki_cards: &[AnkiCardId],
    ) -> Result<(), RepositoryError>;

    /// The fields hash of each of `notes` the profile's syncs have read, by note.
    async fn get_imported_note_hashes(
        &self,
        profile: &str,
        notes: &[AnkiNoteId],
    ) -> Result<HashMap<AnkiNoteId, String>, RepositoryError>;

    async fn save_imported_note_hashes(
        &self,
        profile: &str,
        hashes: &[(AnkiNoteId, String)],
    ) -> Result<(), RepositoryError>;

    /// Anki's reviews made by answering for one of Amber's, as Anki review id to the second of Amber's.
    /// Shared by every device, as AnkiWeb gives each one's Anki the same reviews.
    async fn get_answered_reviews(&self) -> Result<HashMap<i64, i64>, RepositoryError>;

    async fn save_answered_reviews(&self, reviews: &[(i64, i64)]) -> Result<(), RepositoryError>;
}
