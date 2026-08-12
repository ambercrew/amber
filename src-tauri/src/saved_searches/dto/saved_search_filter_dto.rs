use serde::{Deserialize, Serialize};

use crate::saved_searches::entities::saved_search_filter::{ElementFilter, SavedSearchFilter};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchFilterDto {
    pub index: i64,
    pub filter: ElementFilter,
}

impl From<SavedSearchFilter> for SavedSearchFilterDto {
    fn from(filter: SavedSearchFilter) -> Self {
        SavedSearchFilterDto {
            index: filter.index,
            filter: filter.filter,
        }
    }
}

impl From<SavedSearchFilterDto> for SavedSearchFilter {
    fn from(dto: SavedSearchFilterDto) -> Self {
        SavedSearchFilter {
            index: dto.index,
            filter: dto.filter,
        }
    }
}
