use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedSearch {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
}
