use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use serde::Serialize;
use thiserror::Error;

use crate::anki_sync::events::replay_card_reviews_event::CardHistoryDto;
use crate::study::entities::card_review::CardReview;

#[derive(Error, Debug)]
pub enum SyncFrontendError {
    #[error("Failed to ask the frontend for help with the Anki sync")]
    Emit,
    #[error("The frontend did not answer the Anki sync in time")]
    Timeout,
    #[error("The frontend sent an invalid answer to the Anki sync")]
    InvalidResponse,
    #[error("{0}")]
    Failed(String),
}

/// What a running sync is busy with, shown to the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AnkiSyncStage {
    Deleting,
    Importing,
    Sending,
    Reviews,
}

/// The work only the frontend can do: scheduling with ts-fsrs and showing progress.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait SyncFrontend: Send + Sync {
    /// Each card's review state after replaying its reviews, in order.
    async fn replay_reviews(
        &self,
        cards: Vec<CardHistoryDto>,
    ) -> Result<Vec<CardReview>, SyncFrontendError>;

    /// Tells the user how far `stage` got; a `total` of 0 means it can't be counted.
    fn report_progress(&self, stage: AnkiSyncStage, current: usize, total: usize);
}
