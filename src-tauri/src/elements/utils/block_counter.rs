use serde_json::Value;

/// Number of top-level blocks in a serialized Lexical editor state, stored as a split's `block_count`.
/// Content that isn't a Lexical state has none.
pub fn count_top_level_blocks(content: &str) -> u32 {
    serde_json::from_str::<Value>(content)
        .ok()
        .and_then(|root| root.pointer("/root/children")?.as_array().map(Vec::len))
        .map_or(0, |count| u32::try_from(count).unwrap_or(u32::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_top_level_blocks_multiple_blocks_returns_count() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"paragraph","children":[{"type":"text","text":"First"}]},
            {"type":"heading","children":[]},
            {"type":"paragraph","children":[]}
        ]}}"#;

        // Act

        let actual = count_top_level_blocks(content);

        // Assert

        assert_eq!(3, actual);
    }

    #[test]
    fn count_top_level_blocks_nested_children_counts_only_top_level() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"list","children":[{"type":"listitem","children":[]},{"type":"listitem","children":[]}]}
        ]}}"#;

        // Act

        let actual = count_top_level_blocks(content);

        // Assert

        assert_eq!(1, actual);
    }

    #[test]
    fn count_top_level_blocks_invalid_json_returns_zero() {
        // Arrange

        let content = "not json";

        // Act

        let actual = count_top_level_blocks(content);

        // Assert

        assert_eq!(0, actual);
    }

    #[test]
    fn count_top_level_blocks_without_root_children_returns_zero() {
        // Arrange

        let content = "{}";

        // Act

        let actual = count_top_level_blocks(content);

        // Assert

        assert_eq!(0, actual);
    }
}
