use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::search::value_objects::search_sort::{SearchSort, SearchSortColumn, SortDirection};

pub struct SavedSearchRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub sort_column: Option<String>,
    pub sort_direction: Option<String>,
}

impl From<SavedSearchRow> for SavedSearch {
    fn from(row: SavedSearchRow) -> Self {
        SavedSearch {
            id: row.id.into_uuid(),
            created_at: row.created_at,
            modified_at: row.modified_at,
            name: row.name,
            sort: parse_sort(row.sort_column.as_deref(), row.sort_direction.as_deref()),
        }
    }
}

// An unknown value, e.g. a column synced from a newer app version, falls back
// to the Browser's default sort.
fn parse_sort(column: Option<&str>, direction: Option<&str>) -> Option<SearchSort> {
    Some(SearchSort {
        column: SearchSortColumn::parse(column?)?,
        direction: SortDirection::parse(direction?)?,
    })
}
