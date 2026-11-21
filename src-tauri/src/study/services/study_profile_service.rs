use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::{
    MAX_LEECH_THRESHOLD, MAX_MAXIMUM_INTERVAL_DAYS, MAX_NEW_CARDS_PER_DAY, StudyProfile,
};
use crate::study::value_objects::leech_action::LeechAction;
use crate::study::value_objects::priority_inheritance_policy::PriorityInheritancePolicy;
use crate::study::value_objects::step_unit::StepUnit;

/// FSRS models are trained on exactly this many weights.
pub const FSRS_PARAM_COUNT: usize = 21;

/// Fields editable through the Profile modal. `is_default` is intentionally
/// excluded: default status only changes via `set_default`.
#[derive(Debug, Clone, PartialEq)]
pub struct StudyProfileFields {
    pub name: String,
    pub desired_retention: f32,
    /// `None` means "use the default weights" on create, or "leave
    /// unchanged" on update.
    pub fsrs_params: Option<Vec<f32>>,
    pub learning_steps: Option<Vec<StepUnit>>,
    pub relearning_steps: Option<Vec<StepUnit>>,
    pub initial_interval_multiplier: f32,
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
    pub maximum_interval_days: u32,
    pub new_cards_per_day: u32,
    pub leech_threshold: u32,
    pub leech_action: LeechAction,
    pub card_initial_interval_days: f32,
    pub priority_inheritance_policy: PriorityInheritancePolicy,
}

#[async_trait]
pub trait StudyProfileService: Send + Sync {
    async fn list_profiles(&self) -> Result<Vec<StudyProfile>, RepositoryError>;
    async fn create_profile(
        &self,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError>;
    /// Keeps the stored name, so a save can't undo a rename made since (see `rename_profile`).
    async fn update_profile(
        &self,
        id: Uuid,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError>;
    /// Changes only the name, leaving the other fields as stored.
    async fn rename_profile(&self, id: Uuid, name: String)
    -> Result<StudyProfile, RepositoryError>;
    async fn delete_profile(&self, id: Uuid) -> Result<(), RepositoryError>;
    async fn clone_profile(&self, id: Uuid) -> Result<StudyProfile, RepositoryError>;

    /// One-way: makes `id` the default profile, clearing the flag on
    /// whichever profile held it before.
    async fn set_default_profile(&self, id: Uuid) -> Result<StudyProfile, RepositoryError>;

    /// Sets (`Some`) or clears (`None`, i.e. inherit from parent) the
    /// element's own study profile.
    async fn assign_profile(
        &self,
        element_id: ElementId,
        profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError>;

    /// Same as `assign_profile`, applied to every element in `element_ids`.
    async fn assign_profile_many(
        &self,
        element_ids: Vec<ElementId>,
        profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError>;
}

#[derive(Debug, Error)]
pub enum StudyProfileServiceError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error("expected {FSRS_PARAM_COUNT} FSRS parameters, got {actual}")]
    InvalidFsrsParamCount { actual: usize },

    #[error("expected a maximum interval from 1 to {MAX_MAXIMUM_INTERVAL_DAYS} days, got {actual}")]
    InvalidMaximumInterval { actual: u32 },

    #[error(
        "expected an initial interval from 0 to {MAX_MAXIMUM_INTERVAL_DAYS} days, got {actual}"
    )]
    InvalidInitialInterval { actual: f32 },

    #[error("expected at most {MAX_NEW_CARDS_PER_DAY} new cards per day, got {actual}")]
    InvalidNewCardsPerDay { actual: u32 },

    #[error("expected a leech threshold of at most {MAX_LEECH_THRESHOLD} lapses, got {actual}")]
    InvalidLeechThreshold { actual: u32 },
}
