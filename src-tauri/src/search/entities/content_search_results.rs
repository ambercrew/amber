use crate::elements::value_objects::element_id::ElementId;
use crate::search::utils::text_matches::Snippet;

/// A match in an element's content; `index` counts its matches the way find in page does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentMatch {
    pub index: u32,
    pub snippet: Snippet,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElementContentMatches {
    pub element_id: ElementId,
    pub name: String,
    pub matches: Vec<ContentMatch>,
}

/// Elements whose content matches a query, by priority; `truncated` when the match cap cut it short.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ContentSearchResults {
    pub elements: Vec<ElementContentMatches>,
    pub truncated: bool,
}
