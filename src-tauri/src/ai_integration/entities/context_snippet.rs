use std::collections::HashMap;

use uuid::Uuid;

/// A text snippet used  as additional context when sending a
/// human message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextSnippet {
    id: Uuid,
    message_id: Uuid,
    snippet: String,
    position: i64,
}

impl ContextSnippet {
    pub fn new(id: Option<Uuid>, message_id: Uuid, snippet: String, position: i64) -> Self {
        Self {
            id: id.unwrap_or(Uuid::new_v4()),
            message_id,
            snippet,
            position,
        }
    }

    pub fn new_unchecked(id: Uuid, message_id: Uuid, snippet: String, position: i64) -> Self {
        Self {
            id,
            message_id,
            snippet,
            position,
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    pub fn message_id(&self) -> Uuid {
        self.message_id
    }

    pub fn snippet(&self) -> &str {
        &self.snippet
    }

    pub fn position(&self) -> i64 {
        self.position
    }
}

/// Groups snippets (already in position order) by their message, keeping only the text.
pub fn group_snippets_by_message(snippets: Vec<ContextSnippet>) -> HashMap<Uuid, Vec<String>> {
    let mut grouped: HashMap<Uuid, Vec<String>> = HashMap::new();
    for snippet in snippets {
        grouped
            .entry(snippet.message_id)
            .or_default()
            .push(snippet.snippet);
    }
    grouped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_snippets_by_message_multiple_messages_grouped_snippets_per_message() {
        // Arrange

        let message_one = Uuid::new_v4();
        let message_two = Uuid::new_v4();
        let snippets = vec![
            ContextSnippet::new(None, message_one, "First".to_string(), 0),
            ContextSnippet::new(None, message_two, "Second".to_string(), 0),
            ContextSnippet::new(None, message_one, "Third".to_string(), 1),
        ];

        // Act

        let actual = group_snippets_by_message(snippets);

        // Assert

        assert_eq!(
            actual.get(&message_one),
            Some(&vec!["First".to_string(), "Third".to_string()])
        );
        assert_eq!(actual.get(&message_two), Some(&vec!["Second".to_string()]));
    }
}
