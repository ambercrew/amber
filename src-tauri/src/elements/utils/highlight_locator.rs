use serde::Deserialize;
use serde_json::Value;
use serde_json::value::RawValue;

#[derive(Deserialize)]
struct EditorState<'a> {
    #[serde(borrow)]
    root: Root<'a>,
}

#[derive(Deserialize)]
struct Root<'a> {
    #[serde(borrow, default)]
    children: Vec<&'a RawValue>,
}

/// The index of the first top-level block in a serialized Lexical state holding a highlight of
/// `element_id`, the element an extract or cloze made from it became.
pub fn find_highlight_block(content: &str, element_id: &str) -> Option<u32> {
    let state = serde_json::from_str::<EditorState>(content).ok()?;
    let block = state.root.children.iter().position(|raw| {
        // Only blocks naming the id are parsed.
        raw.get().contains(element_id)
            && serde_json::from_str::<Value>(raw.get())
                .is_ok_and(|node| holds_highlight(&node, element_id))
    })?;
    u32::try_from(block).ok()
}

fn holds_highlight(node: &Value, element_id: &str) -> bool {
    let is_match = node.get("type").and_then(Value::as_str) == Some("highlight")
        && node
            .get("ids")
            .and_then(Value::as_array)
            .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(element_id)));
    is_match
        || node
            .get("children")
            .and_then(Value::as_array)
            .is_some_and(|children| {
                children
                    .iter()
                    .any(|child| holds_highlight(child, element_id))
            })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(blocks: &str) -> String {
        format!(r#"{{"root":{{"type":"root","children":[{blocks}]}}}}"#)
    }

    #[test]
    fn find_highlight_block_nested_highlight_returns_its_top_level_block() {
        // Arrange

        let content = state(
            r#"{"type":"paragraph","children":[{"type":"text","text":"a"}]},
               {"type":"list","children":[{"type":"listitem","children":[
                   {"type":"highlight","ids":["card-1"],"children":[{"type":"text","text":"b"}]}]}]}"#,
        );

        // Act

        let actual = find_highlight_block(&content, "card-1");

        // Assert

        assert_eq!(Some(1), actual);
    }

    #[test]
    fn find_highlight_block_id_only_in_text_returns_none() {
        // Arrange

        let content = state(r#"{"type":"paragraph","children":[{"type":"text","text":"card-1"}]}"#);

        // Act

        let actual = find_highlight_block(&content, "card-1");

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn find_highlight_block_invalid_json_returns_none() {
        // Arrange

        let content = "not json";

        // Act

        let actual = find_highlight_block(content, "card-1");

        // Assert

        assert_eq!(None, actual);
    }
}
