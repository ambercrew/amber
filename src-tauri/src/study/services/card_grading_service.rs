use async_trait::async_trait;
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
    ) -> Result<CardReview, GradeCardError>;

    /// The card's current review state plus the study profile it inherits,
    /// which together are the inputs the frontend's scheduler needs. Cards
    /// without a stored review yet get the profile's new-card defaults.
    async fn scheduling_inputs(
        &self,
        card_id: Uuid,
    ) -> Result<(CardReview, StudyProfile), GradeCardError>;

    // Resets the cards review as if it was newly created.
    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError>;
}

#[derive(Debug, Error)]
pub enum GradeCardError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),
}
