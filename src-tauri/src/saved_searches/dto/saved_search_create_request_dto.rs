use serde::Deserialize;

use crate::saved_searches::dto::saved_search_filter_dto::SavedSearchFilterDto;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchCreateRequestDto {
    pub name: String,
    pub filters: Vec<SavedSearchFilterDto>,
}
