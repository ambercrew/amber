use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::learning_asset_mark::LearningAssetMark;
use crate::elements::value_objects::mark_slot::MarkSlot;

#[async_trait]
pub trait LearningAssetMarkRepository: Send + Sync {
    /// The learning asset's set marks, ordered by slot. Unset slots are absent.
    async fn get_all(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetMark>, RepositoryError>;
    /// Places the mark, moving it if its slot is already set.
    async fn set(&self, mark: LearningAssetMark) -> Result<(), RepositoryError>;
    async fn clear(&self, learning_asset_id: Uuid, slot: MarkSlot) -> Result<(), RepositoryError>;
}
