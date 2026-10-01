use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::study::entities::card_review_log::CardReviewLog;

#[async_trait]
pub trait CardReviewLogRepository: Send + Sync {
    async fn create(&self, log: &CardReviewLog) -> Result<(), RepositoryError>;

    /// Reviews of every card that still exists, ordered by card then time.
    async fn get_card_histories(&self) -> Result<Vec<CardReviewLog>, RepositoryError>;
}
