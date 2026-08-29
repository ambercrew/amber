use async_trait::async_trait;
use thiserror::Error;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;
use crate::sync::errors::SyncError;

#[async_trait]
pub trait ProfileResolutionService: Send + Sync {
    /// Resolves the effective profile for `element_id`, or the app-wide
    /// default/oldest profile when `None` (e.g. a not-yet-created element
    /// with no parent, whose own meta row doesn't exist yet to resolve against).
    async fn resolve_profile(
        &self,
        element_id: Option<ElementId>,
    ) -> Result<StudyProfile, ProfileResolutionError>;

    /// Same resolution as `resolve_profile`, but also reports where the
    /// profile came from so the UI can show a direct-vs-inherited affordance.
    async fn resolve_effective_profile(
        &self,
        element_id: ElementId,
    ) -> Result<EffectiveProfile, ProfileResolutionError>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct EffectiveProfile {
    pub profile: StudyProfile,
    pub source: ProfileSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileSource {
    /// The element has its own `study_profile_id`.
    Direct,
    /// Inherited from the given ancestor.
    Inherited { from: ElementId },
    /// No profile in the chain; fell back to the app-wide default/oldest.
    Default,
}

#[derive(Debug, Error)]
pub enum ProfileResolutionError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    Sync(#[from] SyncError),
}
