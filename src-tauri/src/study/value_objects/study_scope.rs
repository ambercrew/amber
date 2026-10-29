use uuid::Uuid;

use crate::saved_searches::entities::saved_search_filter::ElementFilter;

/// Narrows the due queue to elements matching a saved search or unsaved filters.
#[derive(Debug, Clone, PartialEq)]
pub enum StudyScope {
    SavedSearch(Uuid),
    Custom(Vec<ElementFilter>),
}
