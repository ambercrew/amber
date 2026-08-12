use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchRow {
    pub element_id: Uuid,
    pub element_type: String,
    pub name: String,
    pub due: Option<DateTime<Utc>>,
}
