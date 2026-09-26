use serde::Deserialize;

use crate::saved_searches::entities::saved_search_filter::ElementFilter;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchElementsRequestDto {
    pub filters: Vec<ElementFilter>,
    /// Caps the result count, keeping the highest-priority matches.
    #[serde(default)]
    pub limit: Option<u32>,
}
