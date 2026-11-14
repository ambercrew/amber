use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::search::utils::text_matches::{Snippet, SnippetWindow};

/// A match in a file uploaded to a chat.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentMatch {
    pub file_name: String,
    /// The 1-based PDF page, `None` for other files.
    pub page: Option<u32>,
    pub snippet: Snippet,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DocumentSearchResults {
    /// In upload order, then reading order.
    pub matches: Vec<DocumentMatch>,
    /// True when there were more matches than `max_matches`.
    pub truncated: bool,
}

#[async_trait]
pub trait DocumentSearchService: Send + Sync {
    /// The first `max_matches` matches of `query` in the chat's uploaded files, ignoring case
    /// like find in page, each with `window` characters of its line around it.
    async fn search(
        &self,
        chat_id: Uuid,
        query: &str,
        max_matches: usize,
        window: SnippetWindow,
    ) -> Result<DocumentSearchResults, RepositoryError>;
}
