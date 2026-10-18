use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::ai_integration::entities::ai_prompt::AiPrompt;

pub struct AiPromptRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub content: String,
}

impl From<AiPromptRow> for AiPrompt {
    fn from(row: AiPromptRow) -> Self {
        AiPrompt {
            id: row.id.into_uuid(),
            created_at: row.created_at,
            modified_at: row.modified_at,
            name: row.name,
            content: row.content,
        }
    }
}
