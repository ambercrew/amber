use uuid::fmt::Hyphenated;

use crate::ai_integration::entities::context_snippet::ContextSnippet;

pub struct ContextSnippetRow {
    pub id: Hyphenated,
    pub ai_message_id: Hyphenated,
    pub snippet: String,
    pub position: i64,
}

impl From<ContextSnippetRow> for ContextSnippet {
    fn from(value: ContextSnippetRow) -> Self {
        ContextSnippet::new_unchecked(
            value.id.into_uuid(),
            value.ai_message_id.into_uuid(),
            value.snippet,
            value.position,
        )
    }
}
