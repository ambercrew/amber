use crate::elements::entities::learning_asset_split::LearningAssetSplit;

/// A learning asset's type-specific content at creation, keeping the `Pdf` and `Extracted` payloads
/// mutually exclusive rather than two optional fields.
#[derive(Debug, Clone)]
pub enum LearningAssetContent {
    Extracted(Vec<LearningAssetSplit>),
    Pdf { bytes: Vec<u8>, page_count: u32 },
}
