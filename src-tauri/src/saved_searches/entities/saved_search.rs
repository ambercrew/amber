use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::search::value_objects::search_sort::SearchSort;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedSearch {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    /// `None` for searches saved before sorting existed.
    pub sort: Option<SearchSort>,
}
