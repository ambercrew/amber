use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::search::value_objects::search_sort::SearchSort;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchResponseDto {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub sort: Option<SearchSort>,
}

impl From<SavedSearch> for SavedSearchResponseDto {
    fn from(saved_search: SavedSearch) -> Self {
        SavedSearchResponseDto {
            id: saved_search.id,
            created_at: saved_search.created_at,
            modified_at: saved_search.modified_at,
            name: saved_search.name,
            sort: saved_search.sort,
        }
    }
}
