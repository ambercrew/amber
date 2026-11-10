use async_trait::async_trait;
use chrono::{DateTime, Utc};
use thiserror::Error;
use uuid::Uuid;

use crate::anki_sync::anki_connect::AnkiConnectError;
use crate::anki_sync::package::writer::AnkiPackageError;
use crate::anki_sync::services::sync_frontend::SyncFrontendError;
use crate::common::repository_error::RepositoryError;
use crate::common::services::lexical_html_converter::LexicalHtmlConverterError;
use crate::database::transaction_manager::TransactionManagerError;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionError;
use crate::import::services::anki_import_service::AnkiImportError;
use crate::import::services::imported_html_converter::ImportedHtmlConverterError;
use crate::study::services::profile_resolution_service::ProfileResolutionError;
use crate::sync::errors::SyncError;
use crate::trash::services::trash_service::TrashServiceError;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct AnkiSyncSummary {
    pub cards: usize,
    pub imported_cards: usize,
    /// Amber's cards sent to Anki for the first time.
    pub sent_cards: usize,
    pub pulled_reviews: usize,
    pub pushed_reviews: usize,
    pub trashed_cards: usize,
    pub deleted_notes: usize,
    /// Amber's cards whose content an edit in Anki replaced.
    pub edited_cards: Vec<Uuid>,
    /// Notes Anki already held that Amber's changes updated.
    pub sent_edits: usize,
    /// Due dates moved in Amber without a review, carried over to Anki.
    pub due_dates_to_anki: usize,
    /// Due dates moved in Anki without a review, carried over to Amber.
    pub due_dates_to_amber: usize,
}

/// Whether Anki answers, and when its open profile last synced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiSyncStatus {
    pub profile: Option<String>,
    pub last_synced_at: Option<DateTime<Utc>>,
    /// Why Anki can't be used right now.
    pub error: Option<String>,
}

/// A top-level deck holding cards Amber doesn't have.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiDeckPreview {
    pub name: String,
    pub new_cards: usize,
    /// Whether the user chose to import it; none if they haven't decided.
    pub import: Option<bool>,
}

/// An Anki deck Amber's cards go to, named after their folders.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiSendingDeck {
    pub name: String,
    pub new_cards: usize,
}

/// What a sync would do, for the user to review first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiSyncPreview {
    pub profile: String,
    pub is_first_sync: bool,
    pub decks: Vec<AnkiDeckPreview>,
    /// Amber's cards going to Anki for the first time, by the deck they land in.
    pub sending_decks: Vec<AnkiSendingDeck>,
    /// Notes Anki already holds that Amber's changes will update.
    pub cards_to_update: usize,
    /// Amber's cards whose edit in Anki comes back to Amber.
    pub cards_edited_in_anki: usize,
    /// Amber's reviews Anki lacks, of the cards the sync pairs.
    pub reviews_to_anki: usize,
    /// Anki's reviews Amber lacks, leaving out cards a deck import brings.
    pub reviews_to_amber: usize,
    /// Due dates moved in Amber without a review, which Anki takes.
    pub due_dates_to_anki: usize,
    /// Due dates moved in Anki without a review, which Amber takes.
    pub due_dates_to_amber: usize,
    pub notes_to_delete: usize,
    pub cards_to_trash: usize,
}

/// The user's decision on one top-level deck.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiDeckChoice {
    pub deck: String,
    pub import: bool,
}

/// Keeps Anki desktop in step with Amber through the AnkiConnect add-on: each side gets the cards made on
/// the other, a card's content belongs to the side that made it, reviews from either side reach the other,
/// and a card deleted on one side goes on the other: to the trash in Amber, for good in Anki.
#[async_trait]
pub trait AnkiSyncService: Send + Sync {
    async fn status(&self) -> Result<AnkiSyncStatus, AnkiSyncError>;

    async fn preview(&self) -> Result<AnkiSyncPreview, AnkiSyncError>;

    /// Only imports the decks chosen now or in an earlier sync.
    async fn sync(&self, choices: Vec<AnkiDeckChoice>) -> Result<AnkiSyncSummary, AnkiSyncError>;
}

#[derive(Debug, Error)]
pub enum AnkiSyncError {
    #[error("An Anki sync is already running")]
    AlreadyRunning,

    /// Matched by the frontend, which doesn't report it as a failure.
    #[error("anki-sync-cancelled")]
    Cancelled,

    #[error(transparent)]
    AnkiConnect(#[from] AnkiConnectError),

    #[error(transparent)]
    Package(#[from] AnkiPackageError),

    #[error(transparent)]
    Import(AnkiImportError),

    #[error(transparent)]
    Trash(#[from] TrashServiceError),

    #[error(transparent)]
    Frontend(#[from] SyncFrontendError),

    #[error(transparent)]
    EditConversion(#[from] ImportedHtmlConverterError),

    #[error(transparent)]
    HtmlConversion(#[from] LexicalHtmlConverterError),

    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ImageOcclusion(#[from] ImageOcclusionError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error(transparent)]
    Transaction(#[from] TransactionManagerError),

    #[error(transparent)]
    Sync(#[from] SyncError),
}

impl From<AnkiImportError> for AnkiSyncError {
    fn from(error: AnkiImportError) -> Self {
        match error {
            AnkiImportError::Cancelled => Self::Cancelled,
            other => Self::Import(other),
        }
    }
}
