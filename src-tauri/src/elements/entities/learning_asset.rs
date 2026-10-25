use super::traits::Element;
use crate::elements::value_objects::learning_asset_type::LearningAssetType;
use crate::elements::value_objects::meta::Meta;
use crate::elements::value_objects::reading_position::ReadingPosition;

#[derive(Debug, Clone, PartialEq)]
pub struct LearningAsset {
    pub meta: Meta,
    /// Whether this is the original PDF file or Lexical text converted at import time.
    pub r#type: LearningAssetType,
    /// Where the user last read up to. Device-independent.
    pub read_point: ReadingPosition,
    /// Interval multiplier applied each time this learning asset is revisited. Seeded from
    /// the effective study profile's `initial_interval_multiplier` at creation time and kept
    /// fixed afterwards, independent of later profile edits.
    pub interval_multiplier: f32,
}

impl Element for LearningAsset {
    fn meta(&self) -> &Meta {
        &self.meta
    }
}
