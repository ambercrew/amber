use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::elements::dto::priority_info_dto::PriorityInfoResponseDto;
use crate::elements::dto::tag_dto::TagResponseDto;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::entities::element_search_result::ElementSearchResult;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchElementResultDto {
    #[serde(flatten)]
    pub element_id: ElementId,
    pub name: String,
    pub priority: PriorityInfoResponseDto,
    pub due: Option<DateTime<Utc>>,
    pub tags: Vec<TagResponseDto>,
}

impl From<ElementSearchResult> for SearchElementResultDto {
    fn from(result: ElementSearchResult) -> Self {
        SearchElementResultDto {
            element_id: result.element_id,
            name: result.name,
            priority: result.priority.into(),
            due: result.due,
            tags: result.tags.into_iter().map(TagResponseDto::from).collect(),
        }
    }
}
