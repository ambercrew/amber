/// Plain-text content of a split, without its Lexical JSON. Used to search splits
/// that haven't been mounted (and so have no live editor to search within).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearningAssetSplitText {
    pub seq: u32,
    pub text: String,
}
