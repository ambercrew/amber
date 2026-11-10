use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::anki_sync::services::anki_sync_service::{
    AnkiDeckChoice, AnkiDeckPreview, AnkiSendingDeck, AnkiSyncPreview, AnkiSyncStatus,
    AnkiSyncSummary,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiSyncResponseDto {
    pub cards: usize,
    pub imported_cards: usize,
    pub sent_cards: usize,
    pub pulled_reviews: usize,
    pub pushed_reviews: usize,
    pub trashed_cards: usize,
    pub deleted_notes: usize,
    pub edited_cards: Vec<Uuid>,
    pub sent_edits: usize,
    pub due_dates_to_anki: usize,
    pub due_dates_to_amber: usize,
}

impl From<AnkiSyncSummary> for AnkiSyncResponseDto {
    fn from(summary: AnkiSyncSummary) -> Self {
        Self {
            cards: summary.cards,
            imported_cards: summary.imported_cards,
            sent_cards: summary.sent_cards,
            pulled_reviews: summary.pulled_reviews,
            pushed_reviews: summary.pushed_reviews,
            trashed_cards: summary.trashed_cards,
            deleted_notes: summary.deleted_notes,
            edited_cards: summary.edited_cards,
            sent_edits: summary.sent_edits,
            due_dates_to_anki: summary.due_dates_to_anki,
            due_dates_to_amber: summary.due_dates_to_amber,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiSyncStatusResponseDto {
    /// None when Anki can't be reached or has no profile open.
    pub profile: Option<String>,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

impl From<AnkiSyncStatus> for AnkiSyncStatusResponseDto {
    fn from(status: AnkiSyncStatus) -> Self {
        Self {
            profile: status.profile,
            last_synced_at: status.last_synced_at,
            error: status.error,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiDeckPreviewDto {
    pub name: String,
    pub new_cards: usize,
    pub import: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiSyncPreviewResponseDto {
    pub profile: String,
    pub is_first_sync: bool,
    pub decks: Vec<AnkiDeckPreviewDto>,
    pub sending_decks: Vec<AnkiSendingDeckDto>,
    pub cards_to_update: usize,
    pub cards_edited_in_anki: usize,
    pub reviews_to_anki: usize,
    pub reviews_to_amber: usize,
    pub due_dates_to_anki: usize,
    pub due_dates_to_amber: usize,
    pub notes_to_delete: usize,
    pub cards_to_trash: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiSendingDeckDto {
    pub name: String,
    pub new_cards: usize,
}

impl From<AnkiSendingDeck> for AnkiSendingDeckDto {
    fn from(deck: AnkiSendingDeck) -> Self {
        Self {
            name: deck.name,
            new_cards: deck.new_cards,
        }
    }
}

impl From<AnkiDeckPreview> for AnkiDeckPreviewDto {
    fn from(deck: AnkiDeckPreview) -> Self {
        Self {
            name: deck.name,
            new_cards: deck.new_cards,
            import: deck.import,
        }
    }
}

impl From<AnkiSyncPreview> for AnkiSyncPreviewResponseDto {
    fn from(preview: AnkiSyncPreview) -> Self {
        Self {
            profile: preview.profile,
            is_first_sync: preview.is_first_sync,
            decks: preview.decks.into_iter().map(Into::into).collect(),
            sending_decks: preview.sending_decks.into_iter().map(Into::into).collect(),
            cards_to_update: preview.cards_to_update,
            cards_edited_in_anki: preview.cards_edited_in_anki,
            reviews_to_anki: preview.reviews_to_anki,
            reviews_to_amber: preview.reviews_to_amber,
            due_dates_to_anki: preview.due_dates_to_anki,
            due_dates_to_amber: preview.due_dates_to_amber,
            notes_to_delete: preview.notes_to_delete,
            cards_to_trash: preview.cards_to_trash,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiDeckChoiceDto {
    pub deck: String,
    pub import: bool,
}

impl From<AnkiDeckChoiceDto> for AnkiDeckChoice {
    fn from(choice: AnkiDeckChoiceDto) -> Self {
        Self {
            deck: choice.deck,
            import: choice.import,
        }
    }
}
