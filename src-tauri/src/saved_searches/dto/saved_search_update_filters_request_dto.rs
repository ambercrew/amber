use serde::Deserialize;

use crate::saved_searches::dto::saved_search_filter_dto::SavedSearchFilterDto;
use crate::search::value_objects::search_sort::SearchSort;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchUpdateFiltersRequestDto {
    pub filters: Vec<SavedSearchFilterDto>,
    #[serde(default)]
    pub sort: Option<SearchSort>,
}
