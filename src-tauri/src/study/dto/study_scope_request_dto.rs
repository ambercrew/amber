use serde::Deserialize;
use uuid::Uuid;

use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::study::value_objects::study_scope::StudyScope;

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StudyScopeRequestDto {
    SavedSearch { saved_search_id: Uuid },
    Custom { filters: Vec<ElementFilter> },
}

impl From<StudyScopeRequestDto> for StudyScope {
    fn from(dto: StudyScopeRequestDto) -> Self {
        match dto {
            StudyScopeRequestDto::SavedSearch { saved_search_id } => {
                StudyScope::SavedSearch(saved_search_id)
            }
            StudyScopeRequestDto::Custom { filters } => StudyScope::Custom(filters),
        }
    }
}
