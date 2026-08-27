use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::services::profile_resolution_service::{EffectiveProfile, ProfileSource};
use crate::study::services::study_profile_service::StudyProfileFields;
use crate::study::value_objects::step_unit::StepUnit;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyProfileResponseDto {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub is_default: bool,
    pub desired_retention: f32,
    pub fsrs_params: Vec<f32>,
    pub learning_steps: Vec<StepUnit>,
    pub relearning_steps: Vec<StepUnit>,
    pub initial_interval_multiplier: f32,
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
}

/// Mirrors ts-fsrs's own `default_learning_steps`/`default_relearning_steps`
/// so a profile that hasn't set its own steps reports the same values the
/// frontend scheduler would otherwise silently fall back to.
fn default_learning_steps() -> Vec<StepUnit> {
    ["1m", "10m"]
        .into_iter()
        .map(|value| StepUnit::try_from(value.to_string()).expect("valid default step"))
        .collect()
}

fn default_relearning_steps() -> Vec<StepUnit> {
    ["10m"]
        .into_iter()
        .map(|value| StepUnit::try_from(value.to_string()).expect("valid default step"))
        .collect()
}

impl From<StudyProfile> for StudyProfileResponseDto {
    fn from(profile: StudyProfile) -> Self {
        StudyProfileResponseDto {
            id: profile.id,
            created_at: profile.created_at,
            modified_at: profile.modified_at,
            name: profile.name,
            is_default: profile.is_default,
            desired_retention: profile.desired_retention,
            fsrs_params: profile
                .fsrs_params
                .unwrap_or_else(|| fsrs::DEFAULT_PARAMETERS.to_vec()),
            learning_steps: profile
                .learning_steps
                .unwrap_or_else(default_learning_steps),
            relearning_steps: profile
                .relearning_steps
                .unwrap_or_else(default_relearning_steps),
            initial_interval_multiplier: profile.initial_interval_multiplier,
            initial_interval_days: profile.initial_interval_days,
            min_interval_days: profile.min_interval_days,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyProfileRequestDto {
    pub name: String,
    pub desired_retention: f32,
    pub fsrs_params: Vec<f32>,
    /// Empty means "use ts-fsrs's own defaults".
    pub learning_steps: Vec<StepUnit>,
    /// Empty means "use ts-fsrs's own defaults".
    pub relearning_steps: Vec<StepUnit>,
    pub initial_interval_multiplier: f32,
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
}

impl From<StudyProfileRequestDto> for StudyProfileFields {
    fn from(dto: StudyProfileRequestDto) -> Self {
        StudyProfileFields {
            name: dto.name,
            desired_retention: dto.desired_retention,
            fsrs_params: Some(dto.fsrs_params),
            learning_steps: (!dto.learning_steps.is_empty()).then_some(dto.learning_steps),
            relearning_steps: (!dto.relearning_steps.is_empty()).then_some(dto.relearning_steps),
            initial_interval_multiplier: dto.initial_interval_multiplier,
            initial_interval_days: dto.initial_interval_days,
            min_interval_days: dto.min_interval_days,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveProfileResponseDto {
    pub profile: StudyProfileResponseDto,
    pub source: &'static str,
    pub inherited_from: Option<ElementId>,
}

impl From<EffectiveProfile> for EffectiveProfileResponseDto {
    fn from(effective: EffectiveProfile) -> Self {
        let (source, inherited_from) = match effective.source {
            ProfileSource::Direct => ("direct", None),
            ProfileSource::Inherited { from } => ("inherited", Some(from)),
            ProfileSource::Default => ("default", None),
        };
        EffectiveProfileResponseDto {
            profile: effective.profile.into(),
            source,
            inherited_from,
        }
    }
}
