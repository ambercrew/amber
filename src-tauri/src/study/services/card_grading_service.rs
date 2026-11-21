use async_trait::async_trait;
use chrono::{DateTime, Utc};
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::services::profile_resolution_service::ProfileResolutionError;
use crate::study::value_objects::rating::Rating;

#[async_trait]
pub trait CardGradingService: Send + Sync {
    /// Persists a review the frontend has already scheduled with ts-fsrs and
    /// logs the rating that produced it.
    async fn register_review(
        &self,
        review: CardReview,
        rating: Rating,
        duration_ms: Option<u32>,
    ) -> Result<RegisteredReview, GradeCardError>;

    /// The card's review state and the profile it inherits, the frontend scheduler's inputs; a card not
    /// reviewed yet gets the profile's new-card defaults.
    async fn scheduling_inputs(
        &self,
        card_id: Uuid,
    ) -> Result<(CardReview, StudyProfile), GradeCardError>;

    /// The card's review as resetting it leaves it, without saving it.
    async fn reset_review(&self, card_id: Uuid) -> Result<CardReview, GradeCardError>;

    // Resets the cards review as if it was newly created.
    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError>;

    async fn set_due(
        &self,
        card_id: Uuid,
        due: DateTime<Utc>,
    ) -> Result<CardReview, GradeCardError>;
}

/// A stored review, and whether it made the card a leech and suspended it, which the grading
/// session applies itself instead of through events.
pub struct RegisteredReview {
    pub review: CardReview,
    pub leeched: bool,
    pub suspended: bool,
}

#[derive(Debug, Error)]
pub enum GradeCardError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),
}
