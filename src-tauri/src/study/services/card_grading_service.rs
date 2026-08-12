use async_trait::async_trait;
use chrono::{DateTime, Utc};
use fsrs::FSRSError;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::entities::card_review::CardReview;
use crate::study::services::profile_resolution_service::ProfileResolutionError;
use crate::study::value_objects::rating::Rating;

#[async_trait]
pub trait CardGradingService: Send + Sync {
    async fn grade_card(
        &self,
        card_id: Uuid,
        rating: Rating,
        duration_ms: Option<u32>,
    ) -> Result<CardReview, GradeCardError>;

    /// Computes the due date that grading `card_id` with each rating would
    /// produce, without persisting a review.
    async fn preview_card(&self, card_id: Uuid) -> Result<CardDuePreview, GradeCardError>;

    // Resets the cards review as if it was newly created.
    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError>;
}

pub struct CardDuePreview {
    pub again: DateTime<Utc>,
    pub hard: DateTime<Utc>,
    pub good: DateTime<Utc>,
    pub easy: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum GradeCardError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error("FSRS scheduling failed: {0}")]
    Fsrs(#[from] FSRSError),
}
