mod export;
mod import_decks;
mod phase_timer;
mod plan;
mod pull_edits;
mod push;
mod refresh_imported;
mod review_sync;
#[cfg(test)]
mod tests;
mod transfer;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::anki_sync::anki_connect::{AnkiConnectClient, active_profile};
use crate::anki_sync::anki_sync_lock::AnkiSyncLock;
use crate::anki_sync::repositories::anki_sync_repository::AnkiSyncRepository;
use crate::anki_sync::services::anki_sync_service::{
    AnkiDeckChoice, AnkiDeckPreview, AnkiSendingDeck, AnkiSyncError, AnkiSyncPreview,
    AnkiSyncService, AnkiSyncStatus, AnkiSyncSummary,
};
use crate::anki_sync::services::sync_frontend::SyncFrontend;
use crate::assets::repositories::asset_repository::AssetRepository;
use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceService;
use crate::common::event_manager::EventManager;
use crate::common::services::lexical_html_converter::LexicalHtmlConverter;
use crate::database::transaction_manager::TransactionManager;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_content_service::ElementContentService;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionService;
use crate::import::repositories::anki_card_link_repository::AnkiCardLinkRepository;
use crate::import::services::anki_import_service::AnkiImportService;
use crate::import::services::imported_html_converter::ImportedHtmlConverter;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::sync::store::SyncStore;
use crate::trash::services::trash_service::TrashService;
use phase_timer::PhaseTimer;
use review_sync::AmberReviewsForAnki;

const AMBER_NOTES_QUERY: &str = r#""note:Amber Basic" OR "note:Amber Image Occlusion""#;
/// Every card that didn't come from Amber.
const ANKI_CARDS_QUERY: &str = r#"-"note:Amber Basic" -"note:Amber Image Occlusion""#;
/// Cards borrowed by a filtered deck, which isn't where they live.
const FILTERED_CARDS_QUERY: &str = "deck:filtered";
const SUSPENDED_CARDS_QUERY: &str = "is:suspended";

/// Runs a sync in phases, one file each: `plan`, `import_decks`, `export`, `push` and `review_sync`. Every
/// commit happens in `sync`, except per deck while importing, so the order of writes reads top to bottom.
#[derive(ScopeInjectable)]
pub struct DefaultAnkiSyncService {
    anki_connect: Arc<dyn AnkiConnectClient>,
    sync_frontend: Arc<dyn SyncFrontend>,
    imported_html_converter: Arc<dyn ImportedHtmlConverter>,
    element_content_service: Arc<dyn ElementContentService>,
    lexical_html_converter: Arc<dyn LexicalHtmlConverter>,
    card_repository: Arc<dyn CardRepository>,
    meta_repository: Arc<dyn MetaRepository>,
    image_occlusion_repository: Arc<dyn ImageOcclusionRepository>,
    image_occlusion_service: Arc<dyn ImageOcclusionService>,
    anki_sync_repository: Arc<dyn AnkiSyncRepository>,
    anki_card_link_repository: Arc<dyn AnkiCardLinkRepository>,
    anki_import_service: Arc<dyn AnkiImportService>,
    trash_service: Arc<dyn TrashService>,
    bibliographical_source_service: Arc<dyn BibliographicalSourceService>,
    asset_repository: Arc<dyn AssetRepository>,
    card_review_repository: Arc<dyn CardReviewRepository>,
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    event_manager: Arc<dyn EventManager>,
    transaction_manager: Arc<dyn TransactionManager>,
    sync_store: Arc<dyn SyncStore>,
    sync_lock: Arc<AnkiSyncLock>,
}

#[async_trait]
impl AnkiSyncService for DefaultAnkiSyncService {
    async fn status(&self) -> Result<AnkiSyncStatus, AnkiSyncError> {
        let profile = match active_profile(self.client()).await {
            Ok(profile) => profile,
            Err(error) => {
                return Ok(AnkiSyncStatus {
                    profile: None,
                    last_synced_at: None,
                    error: Some(error.to_string()),
                });
            }
        };
        let last_synced_at = self.anki_sync_repository.get_last_synced(&profile).await?;
        Ok(AnkiSyncStatus {
            profile: Some(profile),
            last_synced_at,
            error: None,
        })
    }

    async fn preview(&self) -> Result<AnkiSyncPreview, AnkiSyncError> {
        let profile = active_profile(self.client()).await?;
        let plan = self.plan(profile).await?;
        let changes = self.note_changes(&plan).await?;
        // As the sync counts them: it trashes cards deleted in Anki first, and takes Anki's winning edits.
        let mut not_amber: HashSet<Uuid> = plan.cards_to_trash.iter().copied().collect();
        let mut anki_edits_taken = 0;
        for edit in &plan.edited_in_anki {
            if self.takes_anki_edit(edit).await? {
                not_amber.insert(edit.card_id);
                anki_edits_taken += 1;
            }
        }
        let cards_to_update = changes.amber_edits(&not_amber);
        let occlusion_cards: usize = plan
            .imported_occlusions_changed_in_anki
            .values()
            .flatten()
            .map(|change| change.amber_cards)
            .sum();
        let cards_edited_in_anki = anki_edits_taken
            + occlusion_cards
            + plan
                .imported_changed_in_anki
                .values()
                .map(HashMap::len)
                .sum::<usize>();
        let in_anki = plan.cards_in_anki();
        let trashed: HashSet<Uuid> = plan.cards_to_trash.iter().copied().collect();
        let reviews = self
            .count_reviews(&plan.profile, &changes.cards_to_pair(&in_anki, &trashed))
            .await?;
        let decks = plan
            .new_cards
            .iter()
            .map(|(deck, cards)| AnkiDeckPreview {
                name: deck.clone(),
                new_cards: cards.len(),
                import: plan.choices.get(deck).copied(),
            })
            .collect();
        Ok(AnkiSyncPreview {
            profile: plan.profile,
            is_first_sync: plan.is_first_sync,
            decks,
            sending_decks: changes
                .new_cards(&in_anki, &trashed)
                .into_iter()
                .map(|(name, new_cards)| AnkiSendingDeck { name, new_cards })
                .collect(),
            cards_to_update,
            cards_edited_in_anki,
            reviews_to_anki: reviews.to_anki,
            reviews_to_amber: reviews.to_amber,
            due_dates_to_anki: reviews.due_dates_to_anki,
            due_dates_to_amber: reviews.due_dates_to_amber,
            notes_to_delete: plan.notes_to_delete.len(),
            cards_to_trash: plan.cards_to_trash.len(),
        })
    }

    async fn sync(&self, choices: Vec<AnkiDeckChoice>) -> Result<AnkiSyncSummary, AnkiSyncError> {
        let _running = self
            .sync_lock
            .try_start()
            .ok_or(AnkiSyncError::AlreadyRunning)?;
        // Recorded as the last sync, so a note edited in Anki while it runs counts as changed next time.
        let started = Utc::now();
        // Fails fast when Anki isn't open, before converting every card.
        let profile = active_profile(self.client()).await?;
        self.save_deck_choices(&profile, &choices).await?;
        let mut timer = PhaseTimer::start();
        // Committed so planning's slow Anki calls don't hold the write lock.
        self.commit().await?;
        let plan = self.plan(profile).await?;
        self.commit().await?;
        self.check_cancelled()?;
        timer.lap("planning");

        self.trash_cards_deleted_in_anki(&plan).await?;
        // Committed first: writing to Anki can't be undone, but trashing can be redone by the next sync.
        self.commit().await?;
        self.remove_cards_deleted_in_amber(&plan).await?;
        timer.lap("deletions");

        // Before reading Amber's cards, so the new ones' reviews come over in this same sync.
        let imported_cards = self.import_new_cards(&plan).await?;
        timer.lap("importing from Anki");

        // Before the export, so it sends back what Amber made of each edit instead of overwriting it.
        let mut edited_cards = self.pull_edits(&plan).await?;
        self.commit().await?;
        edited_cards.extend(self.refresh_imported_cards(&plan).await?);
        self.commit().await?;
        edited_cards.extend(self.refresh_imported_occlusions(&plan).await?);
        self.anki_sync_repository
            .save_imported_note_hashes(&plan.profile, &plan.imported_note_hashes)
            .await?;
        self.commit().await?;
        timer.lap("edits from Anki");

        let pulled: HashSet<Uuid> = edited_cards.iter().copied().collect();
        let export = self.export(&plan, &pulled).await?;
        self.check_cancelled()?;
        timer.lap(&format!(
            "preparing {} changed notes ({} unchanged cards)",
            export.notes.len(),
            export.unchanged.len()
        ));
        let anki_cards = self.push_notes(&export).await?;
        self.commit().await?;
        self.record_sent(&plan.profile, &export.sent, &plan.guids_to_forget)
            .await?;
        self.commit().await?;
        let pairs = export.pairs(&anki_cards);
        let sent_cards = export.new_cards_sent(&plan.cards_in_anki());
        self.check_cancelled()?;
        timer.lap("sending notes to Anki");

        let reviews = self.prepare_reviews(&plan.profile, &pairs).await?;
        self.commit().await?;
        let pulled = self
            .save_pulled(reviews.pulled, &reviews.amber_histories)
            .await?;
        // Committed before anything is written to Anki, so a failure there is just retried by the next sync.
        self.commit().await?;
        let pushed_reviews = self
            .push_reviews(AmberReviewsForAnki {
                take_amber_schedule: &reviews.take_amber_schedule,
                take_amber_counts: &reviews.take_amber_counts,
                replayed: &pulled.schedules,
                pushed: reviews.pushed,
                answer_in_anki: reviews.answer_in_anki,
            })
            .await?;
        let schedules = self.synced_schedules(&pairs, &reviews.synced).await?;
        timer.lap("reviews");

        self.commit().await?;
        self.anki_sync_repository
            .replace_paired_cards(&plan.profile, &pairs, &schedules)
            .await?;
        self.anki_sync_repository
            .set_last_synced(&plan.profile, started)
            .await?;
        timer.finish();
        Ok(AnkiSyncSummary {
            cards: pairs.len(),
            imported_cards,
            sent_cards,
            pulled_reviews: pulled.logs.values().map(Vec::len).sum(),
            pushed_reviews,
            trashed_cards: plan.cards_to_trash.len(),
            deleted_notes: plan.notes_to_delete.len(),
            edited_cards,
            sent_edits: export.sent_edits,
            due_dates_to_anki: reviews.counts.due_dates_to_anki,
            due_dates_to_amber: reviews.counts.due_dates_to_amber,
        })
    }
}

impl DefaultAnkiSyncService {
    fn client(&self) -> &dyn AnkiConnectClient {
        self.anki_connect.as_ref()
    }

    fn check_cancelled(&self) -> Result<(), AnkiSyncError> {
        if self.sync_lock.is_cancelled() {
            return Err(AnkiSyncError::Cancelled);
        }
        Ok(())
    }

    /// Commits and starts a fresh transaction, since a reading one goes stale over Anki and frontend calls.
    async fn commit(&self) -> Result<(), AnkiSyncError> {
        self.transaction_manager.save_changes().await?;
        Ok(())
    }

    async fn save_deck_choices(
        &self,
        profile: &str,
        choices: &[AnkiDeckChoice],
    ) -> Result<(), AnkiSyncError> {
        for choice in choices {
            self.anki_sync_repository
                .save_deck_choice(profile, &choice.deck, choice.import)
                .await?;
        }
        Ok(())
    }
}
