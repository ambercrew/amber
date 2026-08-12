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

    /// Creates the review row if it doesn't exist yet, otherwise updates it in place.
    async fn upsert(&self, review: &LearningAssetReview) -> Result<(), RepositoryError>;

    /// LearningAssets/extracts due on or before `as_of`, including elements that have never
    /// been reviewed, paired with their priority. Finished elements are excluded.
    async fn get_due_elements(
        &self,
        as_of: DateTime<Utc>,
    ) -> Result<Vec<ElementIdWithPriority>, RepositoryError>;
}
