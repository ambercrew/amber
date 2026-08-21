use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::elements::entities::learning_asset::LearningAsset;
use crate::elements::extensions::into_element_id_ext::IntoOptionalElementIdExt;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::elements::value_objects::read_point::ReadPoint;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LearningAssetRow {
    pub id: Hyphenated,
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
    pub readpoint_split: i64,
    pub readpoint_block: i64,
    pub interval_multiplier: f64,
}

impl From<LearningAssetRow> for LearningAsset {
    fn from(row: LearningAssetRow) -> Self {
        LearningAsset {
            meta: Meta {
                element_id: ElementId::LearningAsset(row.id.into_uuid()),
                name: row.name,
                parent: (row.parent_id.map(Hyphenated::into_uuid), row.parent_type)
                    .into_element_id(),
                derived_from: (
                    row.derived_from_id.map(Hyphenated::into_uuid),
                    row.derived_from_type,
                )
                    .into_element_id(),
                study_profile_id: row.study_profile_id.map(Hyphenated::into_uuid),
                bibliographical_source_id: row.bibliographical_source_id.map(Hyphenated::into_uuid),
                position: fractional_index::FractionalIndex::from_bytes(row.position)
                    .expect("Invalid fractional index"),
                priority: fractional_index::FractionalIndex::from_bytes(row.priority)
                    .expect("Invalid fractional index"),
                created_at: row.created_at,
                modified_at: row.modified_at,
            },
            read_point: ReadPoint {
                split: row.readpoint_split as u32,
                block: row.readpoint_block as u32,
            },
            interval_multiplier: row.interval_multiplier as f32,
        }
    }
}
