use serde::Deserialize;

use crate::saved_searches::entities::saved_search_filter::ElementFilter;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchElementsRequestDto {
    pub filters: Vec<ElementFilter>,
}
