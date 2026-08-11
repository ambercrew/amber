use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id_with_priority::ElementIdWithPriority;
use crate::study::entities::card_review::CardReview;

#[async_trait]
pub trait CardReviewRepository: Send + Sync {
    async fn get_by_card_id(&self, card_id: Uuid) -> Result<Option<CardReview>, RepositoryError>;

    /// Creates the review row if it doesn't exist yet, otherwise updates it in place.
    async fn upsert(&self, review: &CardReview) -> Result<(), RepositoryError>;

    /// Cards due on or before `as_of`, including cards that have never been reviewed,
    /// paired with their priority so callers don't need a separate lookup.
    async fn get_due_cards(
        &self,
        as_of: DateTime<Utc>,
    ) -> Result<Vec<ElementIdWithPriority>, RepositoryError>;

    /// Deletes the review rows for `card_ids`, so those cards revert to "never reviewed".
    async fn delete_by_card_ids(&self, card_ids: Vec<Uuid>) -> Result<(), RepositoryError>;
}
