use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::learning_asset::{
    LearningAsset, LearningAssetContent, LearningAssetSplitId, LearningAssetSplitMeta,
    LearningAssetSplitText,
};
use crate::elements::value_objects::read_point::ReadPoint;

#[async_trait]
pub trait LearningAssetRepository: Send + Sync {
    async fn get_all(&self) -> Result<Vec<LearningAsset>, RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<LearningAsset, RepositoryError>;
    async fn create(
        &self,
        learning_asset: LearningAsset,
        content: LearningAssetContent,
    ) -> Result<(), RepositoryError>;
    /// Lightweight per-split metadata (`seq` + content length), ordered by `seq`.
    /// Does not load split content — used to lay out the learning asset view.
    async fn get_split_manifest(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetSplitMeta>, RepositoryError>;
    /// Content of a single split, loaded on demand as it is about to be mounted.
    async fn get_split_content(
        &self,
        split_id: LearningAssetSplitId,
    ) -> Result<String, RepositoryError>;
    /// Plain-text content of every split, ordered by `seq`. Used by find-in-page to
    /// search splits that aren't currently mounted (and so have no live editor).
    async fn get_split_texts(
        &self,
        learning_asset_id: Uuid,
    ) -> Result<Vec<LearningAssetSplitText>, RepositoryError>;
    async fn update_content(
        &self,
        split_id: LearningAssetSplitId,
        content: String,
    ) -> Result<(), RepositoryError>;
    async fn update_read_point(
        &self,
        learning_asset_id: Uuid,
        read_point: ReadPoint,
    ) -> Result<(), RepositoryError>;
    async fn update_interval_multiplier(
        &self,
        learning_asset_id: Uuid,
        interval_multiplier: f32,
    ) -> Result<(), RepositoryError>;
    async fn get_pdf_bytes(&self, learning_asset_id: Uuid) -> Result<Vec<u8>, RepositoryError>;
}
