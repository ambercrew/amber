use std::collections::{BTreeSet, HashSet};
use std::sync::Arc;

use super::DefaultAnkiSyncService;
use super::plan::{SyncPlan, fields_hash};
use crate::anki_sync::anki_connect::{cards_info, notes_info};
use crate::anki_sync::notes::folder_paths;
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::anki_sync::services::sync_frontend::AnkiSyncStage;
use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceFields;
use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;

impl DefaultAnkiSyncService {
    /// Imports the chosen decks' new cards through the `.apkg` importer, from a package Anki exports per
    /// top-level deck. Commits after each deck, as the importer waits on the frontend, which must write meanwhile.
    pub(super) async fn import_new_cards(&self, plan: &SyncPlan) -> Result<usize, AnkiSyncError> {
        let decks: Vec<(&String, &HashSet<AnkiCardId>)> = plan
            .new_cards
            .iter()
            .filter(|(deck, _)| plan.choices.get(*deck) == Some(&true))
            .collect();
        if decks.is_empty() {
            return Ok(0);
        }
        let total: usize = decks.iter().map(|(_, cards)| cards.len()).sum();
        self.sync_frontend
            .report_progress(AnkiSyncStage::Importing, 0, total);
        let metas = self.meta_repository.get_all_ordered_by_priority().await?;
        let anki_decks = self
            .anki_card_link_repository
            .get_folder_anki_decks()
            .await?;
        let folders = folder_paths(&metas, &anki_decks);
        self.commit().await?;

        let mut imported = 0;
        for (deck, cards) in decks {
            self.check_cancelled()?;
            let hashes = self.note_hashes(cards).await?;
            let bytes = self.export_deck(deck).await?;
            let source = self
                .bibliographical_source_service
                .create_or_reuse_bibliographical_source(BibliographicalSourceFields {
                    title: deck.clone(),
                    authors: None,
                    publication_date: None,
                    source_type: BibliographicalSourceType::File,
                    location: Some(format!("Anki: {deck}")),
                })
                .await?;
            self.commit().await?;
            let frontend = self.sync_frontend.clone();
            let lock = self.sync_lock.clone();
            let before = imported;
            imported += self
                .anki_import_service
                .import_cards(
                    bytes,
                    cards.clone(),
                    folders.clone(),
                    Some(source.id),
                    Arc::new(move |converted| {
                        let current = before + converted;
                        frontend.report_progress(AnkiSyncStage::Importing, current, total);
                        !lock.is_cancelled()
                    }),
                )
                .await?;
            self.record_skipped(&plan.profile, cards).await?;
            // So the first tag or deck change in Anki isn't taken for an edit of the note's fields.
            self.anki_sync_repository
                .save_imported_note_hashes(&plan.profile, &hashes)
                .await?;
            self.commit().await?;
        }
        Ok(imported)
    }

    /// The fields hash of each card's note, read before the export so an edit made meanwhile is still
    /// found by the next sync.
    async fn note_hashes(
        &self,
        cards: &HashSet<AnkiCardId>,
    ) -> Result<Vec<(AnkiNoteId, String)>, AnkiSyncError> {
        let cards: Vec<AnkiCardId> = cards.iter().copied().collect();
        let notes: BTreeSet<AnkiNoteId> = cards_info(self.client(), &cards)
            .await?
            .into_iter()
            .map(|info| info.note)
            .collect();
        let notes: Vec<AnkiNoteId> = notes.into_iter().collect();
        let infos = notes_info(self.client(), &notes).await?;
        Ok(infos
            .iter()
            .map(|info| (info.note_id, fields_hash(info)))
            .collect())
    }

    /// Remembers the wanted cards the importer left out, so they aren't new again on every sync.
    async fn record_skipped(
        &self,
        profile: &str,
        wanted: &HashSet<AnkiCardId>,
    ) -> Result<(), AnkiSyncError> {
        let links = self.anki_card_link_repository.get_all().await?;
        let linked: HashSet<AnkiCardId> = links.iter().map(|link| link.anki_card_id).collect();
        let skipped: Vec<AnkiCardId> = wanted.difference(&linked).copied().collect();
        self.anki_sync_repository
            .add_skipped_cards(profile, &skipped)
            .await?;
        Ok(())
    }
}
