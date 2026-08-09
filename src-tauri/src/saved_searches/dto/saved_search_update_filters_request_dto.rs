use serde::Deserialize;

use crate::saved_searches::dto::saved_search_filter_dto::SavedSearchFilterDto;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchUpdateFiltersRequestDto {
    pub filters: Vec<SavedSearchFilterDto>,
}
