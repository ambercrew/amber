/// Lightweight description of a split, without its content. Used to lay out the
/// learning asset view without loading every split into memory: `char_count` drives the
/// height estimate for splits that haven't been mounted yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearningAssetSplitMeta {
    pub seq: u32,
    pub char_count: u32,
    pub block_count: u32,
}
