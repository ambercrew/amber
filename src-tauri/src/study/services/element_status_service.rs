use async_trait::async_trait;

use crate::elements::value_objects::element_id::ElementId;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingError;
use crate::study::value_objects::element_status::ElementStatus;

#[async_trait]
pub trait ElementStatusService: Send + Sync {
    /// Moves each of `ids` to `status`, skipping elements it doesn't apply to (folders, finished cards).
    /// Returns how many it applied to.
    async fn set_status_many(
        &self,
        ids: Vec<ElementId>,
        status: ElementStatus,
    ) -> Result<usize, LearningAssetSchedulingError>;
}
