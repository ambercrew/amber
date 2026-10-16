use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::ai_integration::entities::chat::Chat;

/// A `Chat` with the date of its latest message, so the chat list can be grouped by recency.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponseDto {
    id: Uuid,
    created_date: DateTime<Utc>,
    title: String,
    last_activity_date: DateTime<Utc>,
}

impl ChatResponseDto {
    pub fn new(chat: Chat, last_activity_date: DateTime<Utc>) -> Self {
        Self {
            id: chat.id(),
            created_date: chat.created_date(),
            title: chat.title().to_string(),
            last_activity_date,
        }
    }
}
