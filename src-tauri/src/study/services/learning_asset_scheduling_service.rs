use async_trait::async_trait;
use chrono::{DateTime, Utc};
use thiserror::Error;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::services::profile_resolution_service::ProfileResolutionError;

#[async_trait]
pub trait LearningAssetSchedulingService: Send + Sync {
    /// Advances to the next interval (`interval_days * interval_multiplier`, or `initial_interval_days` at
    /// first), at least `min_interval_days`; `duration_ms` is logged as study time.
    async fn next(
        &self,
        element_id: ElementId,
        duration_ms: Option<u32>,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    /// Computes the due date that `next` would produce, without persisting it.
    async fn preview_next(
        &self,
        element_id: ElementId,
    ) -> Result<DateTime<Utc>, LearningAssetSchedulingError>;

    /// Marks the element finished and unsuspends it. Leaves `due` and `interval_days`
    /// untouched, which is what makes undo trivial. `duration_ms` is logged as in `next`.
    async fn finish(
        &self,
        element_id: ElementId,
        duration_ms: Option<u32>,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    /// Clears `finished_at` and resets `due` to today so the element
    /// resurfaces immediately rather than being retroactively overdue.
    async fn unfinish(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    async fn set_due(
        &self,
        element_id: ElementId,
        due: DateTime<Utc>,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;
}

#[derive(Debug, Error)]
pub enum LearningAssetSchedulingError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error("element has never been reviewed")]
    NeverReviewed,

    #[error("element cannot be scheduled")]
    NotSchedulable,
}
