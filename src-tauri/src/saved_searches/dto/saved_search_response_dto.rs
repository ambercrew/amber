use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::saved_searches::entities::saved_search::SavedSearch;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchResponseDto {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
}

impl From<SavedSearch> for SavedSearchResponseDto {
    fn from(saved_search: SavedSearch) -> Self {
        SavedSearchResponseDto {
            id: saved_search.id,
            created_at: saved_search.created_at,
            modified_at: saved_search.modified_at,
            name: saved_search.name,
        }
    }
}
