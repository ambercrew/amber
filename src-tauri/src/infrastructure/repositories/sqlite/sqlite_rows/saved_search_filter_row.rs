use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;

pub struct SavedSearchFilterRow {
    pub index: i64,
    pub filter: String,
}

impl From<SavedSearchFilterRow> for SavedSearchFilter {
    fn from(row: SavedSearchFilterRow) -> Self {
        SavedSearchFilter {
            index: row.index,
            filter: serde_json::from_str(&row.filter).expect("Invalid filter JSON"),
        }
    }
}
