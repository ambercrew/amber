use uuid::Uuid;

use crate::elements::entities::learning_asset::LearningAssetSplitId;

/// An element whose stored Lexical JSON can embed images.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetDocument {
    Extract(Uuid),
    Card(Uuid),
    LearningAssetSplit(LearningAssetSplitId),
}
