use chrono::{DateTime, Utc};
use uuid::Uuid;

/// A reusable prompt from the user's prompt library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiPrompt {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub content: String,
}
