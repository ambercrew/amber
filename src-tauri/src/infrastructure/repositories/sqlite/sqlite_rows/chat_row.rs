use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::ai_integration::entities::chat::Chat;

pub struct ChatRow {
    pub id: Hyphenated,
    pub title: String,
    pub created_date: DateTime<Utc>,
}

impl From<ChatRow> for Chat {
    fn from(value: ChatRow) -> Self {
        Chat::new_unchecked(value.id.into_uuid(), value.created_date, value.title)
    }
}
