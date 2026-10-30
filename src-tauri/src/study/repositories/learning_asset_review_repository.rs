use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id_with_priority::ElementIdWithPriority;
use crate::study::entities::learning_asset_review::LearningAssetReview;

#[async_trait]
pub trait LearningAssetReviewRepository: Send + Sync {
    async fn get_by_element_id(
        &self,
        element_id: Uuid,
    ) -> Result<Option<LearningAssetReview>, RepositoryError>;

    /// The subset of `element_ids` whose review is finished.
    async fn finished_among(&self, element_ids: &[Uuid]) -> Result<Vec<Uuid>, RepositoryError>;

    /// Clears `finished_at` on the finished ones among `element_ids`, also moving `due` when given; returns those changed.
    async fn unfinish_many(
        &self,
        element_ids: &[Uuid],
        due: Option<DateTime<Utc>>,
    ) -> Result<Vec<Uuid>, RepositoryError>;

    /// Creates the review row if it doesn't exist yet, otherwise updates it in place.
    async fn upsert(&self, review: &LearningAssetReview) -> Result<(), RepositoryError>;

    /// LearningAssets/extracts due on or before `as_of`, including elements that have never
    /// been reviewed, paired with their priority. Finished elements are excluded.
    async fn get_due_elements(
        &self,
        as_of: DateTime<Utc>,
    ) -> Result<Vec<ElementIdWithPriority>, RepositoryError>;
}
