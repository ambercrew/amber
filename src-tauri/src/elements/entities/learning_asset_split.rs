use crate::elements::utils::block_counter::count_top_level_blocks;

/// A single chunk of a learning asset's content. Large learning assets are broken into splits so
/// that each can be reviewed independently; a non-split learning asset is just a single
/// split with `seq = 0`. Its content is only set through `new`, so `block_count` can't drift from it.
#[derive(Debug, Clone, PartialEq)]
pub struct LearningAssetSplit {
    pub seq: u32,
    content: String,
    block_count: u32,
}

impl LearningAssetSplit {
    pub fn new(seq: u32, content: String) -> Self {
        let block_count = count_top_level_blocks(&content);
        Self {
            seq,
            content,
            block_count,
        }
    }

    /// Serialized Lexical editor state.
    pub fn content(&self) -> &str {
        &self.content
    }

    /// Top-level blocks in `content`, kept in step with it.
    pub fn block_count(&self) -> u32 {
        self.block_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_lexical_content_counts_top_level_blocks() {
        // Arrange

        let content = r#"{"root":{"children":[{"type":"paragraph","children":[]},{"type":"paragraph","children":[]}]}}"#;

        // Act

        let actual = LearningAssetSplit::new(0, content.to_string());

        // Assert

        assert_eq!(2, actual.block_count());
        assert_eq!(content, actual.content());
    }
}
