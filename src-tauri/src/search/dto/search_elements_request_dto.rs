use serde::Deserialize;

use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::search::value_objects::search_sort::SearchSort;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchElementsRequestDto {
    pub filters: Vec<ElementFilter>,
    #[serde(default)]
    pub sort: SearchSort,
    /// Caps the result count, keeping the first matches in `sort` order.
    #[serde(default)]
    pub limit: Option<u32>,
}
