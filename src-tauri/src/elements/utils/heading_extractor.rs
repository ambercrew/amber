use std::borrow::Cow;

use serde::Deserialize;
use serde_json::Value;
use serde_json::value::RawValue;

use crate::elements::utils::plain_text_extractor::node_plain_text;
use crate::elements::value_objects::learning_asset_heading::LearningAssetHeading;

#[derive(Deserialize)]
struct EditorState<'a> {
    #[serde(borrow)]
    root: Root<'a>,
}

#[derive(Deserialize)]
struct Root<'a> {
    #[serde(borrow, default)]
    children: Vec<Block<'a>>,
}

// Children stay raw, so only headings' text is parsed, not every paragraph's.
#[derive(Deserialize)]
struct Block<'a> {
    #[serde(rename = "type", borrow)]
    node_type: Option<Cow<'a, str>>,
    #[serde(borrow)]
    tag: Option<Cow<'a, str>>,
    #[serde(borrow)]
    children: Option<&'a RawValue>,
}

/// The top-level heading nodes of split `seq`'s serialized Lexical editor state, in order.
/// Content that isn't a Lexical state has none.
pub fn extract_headings(seq: u32, content: &str) -> Vec<LearningAssetHeading> {
    let Ok(state) = serde_json::from_str::<EditorState>(content) else {
        return Vec::new();
    };

    state
        .root
        .children
        .iter()
        .enumerate()
        .filter_map(|(block, node)| {
            if node.node_type.as_deref() != Some("heading") {
                return None;
            }
            let level = node
                .tag
                .as_deref()
                .and_then(|tag| tag.strip_prefix('h')?.parse::<u8>().ok())
                .filter(|level| (1..=6).contains(level))?;
            let children = node
                .children
                .and_then(|raw| serde_json::from_str::<Value>(raw.get()).ok())
                .unwrap_or(Value::Null);
            Some(LearningAssetHeading {
                seq,
                block: u32::try_from(block).ok()?,
                level,
                text: node_plain_text(&children),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_headings_mixed_blocks_returns_headings_with_block_index_and_level() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"heading","tag":"h1","children":[{"type":"text","text":"Chapter"}]},
            {"type":"paragraph","children":[{"type":"text","text":"Body"}]},
            {"type":"heading","tag":"h2","children":[{"type":"text","text":"Sec"},{"type":"text","text":"tion"}]}
        ]}}"#;

        // Act

        let actual = extract_headings(3, content);

        // Assert

        assert_eq!(
            vec![
                LearningAssetHeading {
                    seq: 3,
                    block: 0,
                    level: 1,
                    text: "Chapter".into(),
                },
                LearningAssetHeading {
                    seq: 3,
                    block: 2,
                    level: 2,
                    text: "Section".into(),
                },
            ],
            actual
        );
    }

    #[test]
    fn extract_headings_nested_heading_returns_only_top_level_ones() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"quote","children":[{"type":"heading","tag":"h1","children":[]}]}
        ]}}"#;

        // Act

        let actual = extract_headings(0, content);

        // Assert

        assert!(actual.is_empty());
    }

    #[test]
    fn extract_headings_invalid_json_returns_empty() {
        // Arrange

        let content = "not json";

        // Act

        let actual = extract_headings(0, content);

        // Assert

        assert!(actual.is_empty());
    }
}
