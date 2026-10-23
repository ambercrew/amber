use uuid::Uuid;

/// Identifies a single split within a learning asset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearningAssetSplitId {
    pub learning_asset_id: Uuid,
    pub seq: u32,
}
