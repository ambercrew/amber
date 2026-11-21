use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::entities::card_review_log::CardReviewLog;

#[async_trait]
pub trait CardReviewLogRepository: Send + Sync {
    async fn create(&self, log: &CardReviewLog) -> Result<(), RepositoryError>;

    /// Reviews of every card that still exists, ordered by card then time.
    async fn get_card_histories(&self) -> Result<Vec<CardReviewLog>, RepositoryError>;

    /// Cards whose first review since they were last reset (or ever) is at or after `since`.
    async fn get_cards_first_reviewed_since(
        &self,
        since: DateTime<Utc>,
    ) -> Result<Vec<Uuid>, RepositoryError>;
}
