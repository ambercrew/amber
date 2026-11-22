use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;
use crate::sync::errors::SyncError;

#[async_trait]
pub trait ProfileResolutionService: Send + Sync {
    /// The effective profile for `element_id`, or the default (else oldest) profile for `None`, e.g. a
    /// new element without a parent.
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

    /// The effective profile's id for each of `ids`, by the same resolution as `resolve_profile` but in one walk.
    async fn resolve_profile_ids(
        &self,
        ids: &[Uuid],
    ) -> Result<HashMap<Uuid, Uuid>, ProfileResolutionError>;

    /// The cards among `card_ids` whose effective profile is `profile_id`, by the same
    /// resolution as `resolve_profile`.
    async fn cards_using_profile(
        &self,
        profile_id: Uuid,
        card_ids: &[Uuid],
    ) -> Result<HashSet<Uuid>, ProfileResolutionError>;
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
