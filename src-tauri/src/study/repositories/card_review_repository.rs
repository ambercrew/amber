use async_trait::async_trait;
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::entities::card_review::CardReview;
use crate::study::value_objects::due_element::DueElement;

#[async_trait]
pub trait CardReviewRepository: Send + Sync {
    async fn get_by_card_id(&self, card_id: Uuid) -> Result<Option<CardReview>, RepositoryError>;

    /// Every card's review state, in one query.
    async fn get_all(&self) -> Result<Vec<CardReview>, RepositoryError>;

    /// When each card's due date was last moved without a review, for the cards ever moved so.
    async fn get_due_moved_times(&self) -> Result<HashMap<Uuid, DateTime<Utc>>, RepositoryError>;

    /// Forgets that the card's due date was moved, as a reset taken from Anki puts it back on its own.
    async fn clear_due_moved(&self, card_id: Uuid) -> Result<(), RepositoryError>;

    /// When each card was last reset to new, for the cards ever reset.
    async fn get_reset_times(&self) -> Result<HashMap<Uuid, DateTime<Utc>>, RepositoryError>;

    /// Records that the card was just reset to new.
    async fn mark_reset(&self, card_id: Uuid) -> Result<(), RepositoryError>;

    /// Creates the review row if it doesn't exist yet, otherwise updates it in place.
    async fn upsert(&self, review: &CardReview) -> Result<(), RepositoryError>;

    /// Cards due on or before `as_of`, including cards that have never been reviewed,
    /// with their name and priority so callers don't need a separate lookup.
    async fn get_due_cards(&self, as_of: DateTime<Utc>)
    -> Result<Vec<DueElement>, RepositoryError>;
}
