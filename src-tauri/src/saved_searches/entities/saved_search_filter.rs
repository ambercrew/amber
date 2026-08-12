use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub struct SavedSearchFilter {
    pub index: i64,
    pub filter: ElementFilter,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "field",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ElementFilter {
    Name {
        id: Uuid,
        operator: StringFilterOperator,
        value: String,
    },
    Tags {
        id: Uuid,
        operator: TagsFilterOperator,
        tags: Vec<String>,
    },
    DueDate {
        id: Uuid,
        operator: DateFilterOperator,
        days: Option<i64>,
        from: Option<String>,
        to: Option<String>,
    },
    CreatedDate {
        id: Uuid,
        operator: DateFilterOperator,
        days: Option<i64>,
        from: Option<String>,
        to: Option<String>,
    },
    BibliographicalSource {
        id: Uuid,
        operator: SelectFilterOperator,
        source_ids: Vec<Uuid>,
    },
    ElementType {
        id: Uuid,
        operator: SelectFilterOperator,
        types: Vec<ElementNodeType>,
    },
    Priority {
        id: Uuid,
        operator: RangeFilterOperator,
        min: i64,
        max: i64,
    },
    StudyProfile {
        id: Uuid,
        operator: SelectFilterOperator,
        profile_ids: Vec<Uuid>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StringFilterOperator {
    Contains,
    Equals,
    StartsWith,
    EndsWith,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::enum_variant_names)]
pub enum TagsFilterOperator {
    IsAnyOf,
    IsAllOf,
    IsNoneOf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DateFilterOperator {
    Today,
    WithinDays,
    Before,
    After,
    Between,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SelectFilterOperator {
    IsAnyOf,
    IsNoneOf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RangeFilterOperator {
    Between,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ElementNodeType {
    Folder,
    LearningAsset,
    Extract,
    Card,
}
