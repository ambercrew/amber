use chrono::{DateTime, Utc};

use crate::elements::entities::tag::Tag;
use crate::elements::services::priority_service::PriorityInfo;
use crate::elements::value_objects::element_id::ElementId;

#[derive(Debug, Clone, PartialEq)]
pub struct ElementSearchResult {
    pub element_id: ElementId,
    pub name: String,
    pub priority: PriorityInfo,
    pub due: Option<DateTime<Utc>>,
    pub tags: Vec<Tag>,
}
