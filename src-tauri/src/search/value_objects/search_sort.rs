use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchSortColumn {
    #[default]
    Name,
    Type,
    Priority,
    Due,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    #[default]
    Asc,
    Desc,
}

/// Order of search results; defaults to name, A to Z.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSort {
    pub column: SearchSortColumn,
    pub direction: SortDirection,
}

impl SearchSortColumn {
    pub fn as_str(self) -> &'static str {
        match self {
            SearchSortColumn::Name => "name",
            SearchSortColumn::Type => "type",
            SearchSortColumn::Priority => "priority",
            SearchSortColumn::Due => "due",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "name" => Some(SearchSortColumn::Name),
            "type" => Some(SearchSortColumn::Type),
            "priority" => Some(SearchSortColumn::Priority),
            "due" => Some(SearchSortColumn::Due),
            _ => None,
        }
    }
}

impl SortDirection {
    pub fn as_str(self) -> &'static str {
        match self {
            SortDirection::Asc => "asc",
            SortDirection::Desc => "desc",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "asc" => Some(SortDirection::Asc),
            "desc" => Some(SortDirection::Desc),
            _ => None,
        }
    }
}
