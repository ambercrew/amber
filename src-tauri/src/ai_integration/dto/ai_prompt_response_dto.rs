use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::ai_integration::entities::ai_prompt::AiPrompt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPromptResponseDto {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub content: String,
}

impl From<AiPrompt> for AiPromptResponseDto {
    fn from(prompt: AiPrompt) -> Self {
        AiPromptResponseDto {
            id: prompt.id,
            created_at: prompt.created_at,
            modified_at: prompt.modified_at,
            name: prompt.name,
            content: prompt.content,
        }
    }
}
