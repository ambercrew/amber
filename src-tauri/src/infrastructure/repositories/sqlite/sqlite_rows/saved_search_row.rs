use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::saved_searches::entities::saved_search::SavedSearch;

pub struct SavedSearchRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
}

impl From<SavedSearchRow> for SavedSearch {
    fn from(row: SavedSearchRow) -> Self {
        SavedSearch {
            id: row.id.into_uuid(),
            created_at: row.created_at,
            modified_at: row.modified_at,
            name: row.name,
        }
    }
}
