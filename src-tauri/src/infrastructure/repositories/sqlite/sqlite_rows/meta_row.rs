use chrono::{DateTime, Utc};
use fractional_index::FractionalIndex;
use uuid::fmt::Hyphenated;

use crate::elements::{
    extensions::into_element_id_ext::{IntoElementIdExt, IntoOptionalElementIdExt},
    value_objects::meta::Meta,
};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MetaRow {
    pub element_id: Hyphenated,
    pub element_type: String,
    pub name: String,
    pub position: Vec<u8>,
    pub priority: Vec<u8>,
    pub parent_id: Option<Hyphenated>,
    pub parent_type: Option<String>,
    pub derived_from_id: Option<Hyphenated>,
    pub derived_from_type: Option<String>,
    pub study_profile_id: Option<Hyphenated>,
    pub bibliographical_source_id: Option<Hyphenated>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

impl From<MetaRow> for Meta {
    fn from(row: MetaRow) -> Self {
        Meta {
            element_id: (row.element_id.into_uuid(), row.element_type).into_element_id(),
            name: row.name,
            parent: (row.parent_id.map(Hyphenated::into_uuid), row.parent_type).into_element_id(),
            derived_from: (
                row.derived_from_id.map(Hyphenated::into_uuid),
                row.derived_from_type,
            )
                .into_element_id(),
            position: FractionalIndex::from_bytes(row.position).expect("Invalid fractional index"),
            priority: FractionalIndex::from_bytes(row.priority).expect("Invalid fractional index"),
            study_profile_id: row.study_profile_id.map(Hyphenated::into_uuid),
            bibliographical_source_id: row.bibliographical_source_id.map(Hyphenated::into_uuid),
            created_at: row.created_at,
            modified_at: row.modified_at,
        }
    }
}
