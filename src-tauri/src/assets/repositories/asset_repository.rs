use async_trait::async_trait;

use crate::assets::entities::asset::Asset;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;

#[async_trait]
pub trait AssetRepository: Send + Sync {
    /// Stores the asset unless it already exists; either way, claims it against remote sweeps
    /// for the GC grace period.
    async fn insert_if_missing(&self, asset: &Asset) -> Result<(), RepositoryError>;

    async fn get(&self, id: &AssetId) -> Result<Option<Asset>, RepositoryError>;

    /// Tracks when each asset was first seen unreferenced and deletes those unreferenced
    /// for over `grace_days`, returning the deleted count.
    async fn sweep_unreferenced(&self, grace_days: u32) -> Result<u64, RepositoryError>;
}
