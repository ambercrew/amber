use serde_json::Value;

const BLOCK_NODE_TYPES: [&str; 4] = ["paragraph", "heading", "listitem", "quote"];

/// Derives the plain-text content of a serialized Lexical editor state, for
/// storage in a `content_text` column (e.g. for full-text search) without the
/// backend needing to understand the full Lexical node schema. Any object with
/// a `text` string is treated as a leaf; every nested object/array is walked
/// recursively (regardless of the key it's nested under, e.g. the top-level
/// `root` wrapper); block-level node types get a trailing newline.
pub fn extract_plain_text(content: &str) -> String {
    let Ok(root) = serde_json::from_str::<Value>(content) else {
        return String::new();
    };

    node_plain_text(&root)
}

/// The plain text of one already-parsed Lexical node and its descendants.
pub fn node_plain_text(node: &Value) -> String {
    let mut out = String::new();
    walk(node, &mut out);
    out.trim().to_string()
}

fn walk(node: &Value, out: &mut String) {
    match node {
        Value::Object(obj) => {
            if let Some(text) = obj.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }

            for value in obj.values() {
                walk(value, out);
            }

            if let Some(node_type) = obj.get("type").and_then(Value::as_str)
                && BLOCK_NODE_TYPES.contains(&node_type)
            {
                out.push('\n');
            }
        }
        Value::Array(items) => {
            for item in items {
                walk(item, out);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_plain_text_single_paragraph_returns_text() {
        // Arrange

        let content = r#"{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"Hello world"}]}]}}"#;

        // Act

        let actual = extract_plain_text(content);

        // Assert

        assert_eq!("Hello world", actual);
    }

    #[test]
    fn extract_plain_text_multiple_paragraphs_returns_newline_separated_text() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"paragraph","children":[{"type":"text","text":"First"}]},
            {"type":"paragraph","children":[{"type":"text","text":"Second"}]}
        ]}}"#;

        // Act

        let actual = extract_plain_text(content);

        // Assert

        assert_eq!("First\nSecond", actual);
    }

    #[test]
    fn extract_plain_text_nested_children_returns_concatenated_text() {
        // Arrange

        let content = r#"{"root":{"children":[{"type":"listitem","children":[
            {"type":"text","text":"nested "},
            {"type":"text","text":"text"}
        ]}]}}"#;

        // Act

        let actual = extract_plain_text(content);

        // Assert

        assert_eq!("nested text", actual);
    }

    #[test]
    fn extract_plain_text_invalid_json_returns_empty_string() {
        // Arrange

        let content = "not json";

        // Act

        let actual = extract_plain_text(content);

        // Assert

        assert_eq!("", actual);
    }

    #[test]
    fn extract_plain_text_no_text_nodes_returns_empty_string() {
        // Arrange

        let content = r#"{"root":{"children":[{"type":"paragraph","children":[]}]}}"#;

        // Act

        let actual = extract_plain_text(content);

        // Assert

        assert_eq!("", actual);
    }
}
