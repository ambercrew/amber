/// A split without its content, for laying out the view without loading every split;
/// `char_count` estimates the height of splits not mounted yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearningAssetSplitMeta {
    pub seq: u32,
    pub char_count: u32,
    pub block_count: u32,
}
