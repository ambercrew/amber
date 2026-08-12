use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;

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
    pub initial_interval_multiplier: f32,
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
}

#[async_trait]
pub trait StudyProfileService: Send + Sync {
    async fn list_profiles(&self) -> Result<Vec<StudyProfile>, RepositoryError>;
    async fn create_profile(
        &self,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError>;
    async fn update_profile(
        &self,
        id: Uuid,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError>;
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
}
