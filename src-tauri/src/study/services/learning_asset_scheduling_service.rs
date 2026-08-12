use async_trait::async_trait;
use chrono::{DateTime, Utc};
use thiserror::Error;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::services::profile_resolution_service::ProfileResolutionError;

#[async_trait]
pub trait LearningAssetSchedulingService: Send + Sync {
    /// Advances the element to its next interval (`interval_days * interval_multiplier`, or
    /// `profile.initial_interval_days` on the first pass), floored by
    /// `profile.min_interval_days`.
    async fn next(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    /// Computes the due date that `next` would produce, without persisting it.
    async fn preview_next(
        &self,
        element_id: ElementId,
    ) -> Result<DateTime<Utc>, LearningAssetSchedulingError>;

    /// Marks the element finished. Leaves `due` and `interval_days` untouched,
    /// which is what makes undo trivial.
    async fn finish(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    /// Marks each of `element_ids` finished. See `finish`.
    async fn finish_many(
        &self,
        element_ids: Vec<ElementId>,
    ) -> Result<(), LearningAssetSchedulingError>;

    /// Clears `finished_at` and resets `due` to today so the element
    /// resurfaces immediately rather than being retroactively overdue.
    async fn unfinish(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError>;

    /// Unfinishes each of `element_ids`. See `unfinish`. Elements that were
    /// never reviewed are silently skipped rather than failing the whole
    /// batch, since "never reviewed" and "not finished" are equivalent from
    /// the caller's point of view.
    async fn unfinish_many(
        &self,
        element_ids: Vec<ElementId>,
    ) -> Result<(), LearningAssetSchedulingError>;
}

#[derive(Debug, Error)]
pub enum LearningAssetSchedulingError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error("element has never been reviewed")]
    NeverReviewed,
}
