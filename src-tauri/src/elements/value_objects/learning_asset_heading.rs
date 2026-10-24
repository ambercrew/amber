/// A heading in a learning asset's content, found without mounting its split. Used to build
/// the table of contents.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearningAssetHeading {
    pub seq: u32,
    /// Index of the heading among the split's top-level blocks.
    pub block: u32,
    /// 1 for `h1` through 6 for `h6`.
    pub level: u8,
    pub text: String,
}
