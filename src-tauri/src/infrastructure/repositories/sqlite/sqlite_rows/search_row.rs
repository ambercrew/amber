use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchRow {
    pub element_id: Hyphenated,
    pub element_type: String,
    pub name: String,
    pub due: Option<DateTime<Utc>>,
}
