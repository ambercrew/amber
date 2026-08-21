use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::study::entities::study_profile::StudyProfile;

pub struct StudyProfileRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub is_default: bool,
    pub desired_retention: f64,
    pub fsrs_params: Option<String>,
    pub initial_interval_multiplier: f64,
    pub initial_interval_days: f64,
    pub min_interval_days: f64,
}

impl From<StudyProfileRow> for StudyProfile {
    fn from(row: StudyProfileRow) -> Self {
        StudyProfile {
            id: row.id.into_uuid(),
            created_at: row.created_at,
            modified_at: row.modified_at,
            name: row.name,
            is_default: row.is_default,
            desired_retention: row.desired_retention as f32,
            fsrs_params: row
                .fsrs_params
                .map(|json| serde_json::from_str(&json).expect("Invalid fsrs_params JSON")),
            initial_interval_multiplier: row.initial_interval_multiplier as f32,
            initial_interval_days: row.initial_interval_days as f32,
            min_interval_days: row.min_interval_days as f32,
        }
    }
}
