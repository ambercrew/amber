use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::study::entities::study_profile::{
    DEFAULT_LEECH_THRESHOLD, DEFAULT_MAXIMUM_INTERVAL_DAYS, DEFAULT_NEW_CARDS_PER_DAY,
    MAX_LEECH_THRESHOLD, MAX_MAXIMUM_INTERVAL_DAYS, MAX_NEW_CARDS_PER_DAY, StudyProfile,
};
use crate::study::value_objects::leech_action::LeechAction;
use crate::study::value_objects::priority_inheritance_policy::{
    Placement, PriorityInheritancePolicy,
};

pub struct StudyProfileRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub is_default: bool,
    pub desired_retention: f64,
    pub fsrs_params: Option<String>,
    pub learning_steps: Option<String>,
    pub relearning_steps: Option<String>,
    pub initial_interval_multiplier: f64,
    pub initial_interval_days: f64,
    pub min_interval_days: f64,
    pub maximum_interval_days: i64,
    pub new_cards_per_day: i64,
    pub leech_threshold: i64,
    pub leech_action: String,
    pub card_initial_interval_days: f64,
    pub bury_new_siblings: bool,
    pub bury_review_siblings: bool,
    pub priority_inheritance_placement: Option<String>,
    pub priority_inheritance_percentile: Option<f64>,
    pub priority_inheritance_ceiling_percentile: Option<f64>,
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
            learning_steps: row
                .learning_steps
                .map(|json| serde_json::from_str(&json).expect("Invalid learning_steps JSON")),
            relearning_steps: row
                .relearning_steps
                .map(|json| serde_json::from_str(&json).expect("Invalid relearning_steps JSON")),
            initial_interval_multiplier: row.initial_interval_multiplier as f32,
            initial_interval_days: row.initial_interval_days as f32,
            min_interval_days: row.min_interval_days as f32,
            maximum_interval_days: maximum_interval_from_column(row.maximum_interval_days),
            new_cards_per_day: count_from_column(
                row.new_cards_per_day,
                MAX_NEW_CARDS_PER_DAY,
                DEFAULT_NEW_CARDS_PER_DAY,
            ),
            leech_threshold: count_from_column(
                row.leech_threshold,
                MAX_LEECH_THRESHOLD,
                DEFAULT_LEECH_THRESHOLD,
            ),
            leech_action: LeechAction::from(row.leech_action.as_str()),
            card_initial_interval_days: row.card_initial_interval_days as f32,
            bury_new_siblings: row.bury_new_siblings,
            bury_review_siblings: row.bury_review_siblings,
            priority_inheritance_policy: PriorityInheritancePolicy {
                placement: Placement::from_columns(
                    row.priority_inheritance_placement.as_deref(),
                    row.priority_inheritance_percentile,
                ),
                ceiling_percentile: row.priority_inheritance_ceiling_percentile,
            },
        }
    }
}

/// An out-of-range value, as a synced cell could carry, falls back to the default.
fn maximum_interval_from_column(value: i64) -> u32 {
    u32::try_from(value)
        .ok()
        .filter(|days| (1..=MAX_MAXIMUM_INTERVAL_DAYS).contains(days))
        .unwrap_or(DEFAULT_MAXIMUM_INTERVAL_DAYS)
}

/// A count from 0 to `max`; anything else, as a synced cell could carry, falls back to `default`.
fn count_from_column(value: i64, max: u32, default: u32) -> u32 {
    u32::try_from(value)
        .ok()
        .filter(|count| *count <= max)
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maximum_interval_from_column_negative_value_returns_default() {
        // Arrange

        let value = -1;

        // Act

        let actual = maximum_interval_from_column(value);

        // Assert

        assert_eq!(DEFAULT_MAXIMUM_INTERVAL_DAYS, actual);
    }

    #[test]
    fn maximum_interval_from_column_value_in_range_returns_value() {
        // Arrange

        let value = 365;

        // Act

        let actual = maximum_interval_from_column(value);

        // Assert

        assert_eq!(365, actual);
    }

    #[test]
    fn count_from_column_value_above_max_returns_default() {
        // Arrange

        let value = 10_000;

        // Act

        let actual = count_from_column(value, MAX_NEW_CARDS_PER_DAY, DEFAULT_NEW_CARDS_PER_DAY);

        // Assert

        assert_eq!(DEFAULT_NEW_CARDS_PER_DAY, actual);
    }

    #[test]
    fn count_from_column_zero_returns_zero() {
        // Arrange

        let value = 0;

        // Act

        let actual = count_from_column(value, MAX_LEECH_THRESHOLD, DEFAULT_LEECH_THRESHOLD);

        // Assert

        assert_eq!(0, actual);
    }
}
