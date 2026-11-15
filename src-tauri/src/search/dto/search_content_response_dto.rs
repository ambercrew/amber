use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;
use crate::search::entities::content_search_results::{
    ContentMatch, ContentSearchResults, ElementContentMatches,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchContentResponseDto {
    pub elements: Vec<ElementContentMatchesDto>,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementContentMatchesDto {
    pub element_id: ElementId,
    pub name: String,
    pub matches: Vec<ContentMatchDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMatchDto {
    /// The match's index among its element's matches, as find in page numbers them.
    pub index: u32,
    pub before: String,
    pub text: String,
    pub after: String,
}

impl From<ContentSearchResults> for SearchContentResponseDto {
    fn from(results: ContentSearchResults) -> Self {
        SearchContentResponseDto {
            elements: results.elements.into_iter().map(Into::into).collect(),
            truncated: results.truncated,
        }
    }
}

impl From<ElementContentMatches> for ElementContentMatchesDto {
    fn from(element: ElementContentMatches) -> Self {
        ElementContentMatchesDto {
            element_id: element.element_id,
            name: element.name,
            matches: element.matches.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<ContentMatch> for ContentMatchDto {
    fn from(content_match: ContentMatch) -> Self {
        ContentMatchDto {
            index: content_match.index,
            before: content_match.snippet.before,
            text: content_match.snippet.text,
            after: content_match.snippet.after,
        }
    }
}
