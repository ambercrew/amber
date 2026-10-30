use async_trait::async_trait;
use thiserror::Error;

use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceWithElementCount;
use crate::common::repository_error::RepositoryError;
use crate::elements::services::priority_service::{PriorityError, PriorityInfo};
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::services::profile_resolution_service::{
    EffectiveProfile, ProfileResolutionError,
};
use crate::study::value_objects::element_status::ElementStatus;

/// Everything the Aside details panel needs for a given element, gathered in
/// one round trip instead of one call per section.
#[derive(Debug, Clone, PartialEq)]
pub struct ElementDetails {
    pub bibliographical_source: Option<BibliographicalSourceWithElementCount>,
    pub derived_from_name: Option<String>,
    pub card_review: Option<CardReview>,
    pub learning_asset_review: Option<LearningAssetReview>,
    pub effective_profile: EffectiveProfile,
    pub profiles: Vec<StudyProfile>,
    pub priority: PriorityInfo,
    /// `None` for folders.
    pub status: Option<ElementStatus>,
    /// Name to show for the "inherit from parent" option: the parent's (or
    /// app-wide default's) profile name when this element's profile is
    /// direct, otherwise the effective profile's own name.
    pub inherited_profile_name: Option<String>,
}

#[async_trait]
pub trait ElementDetailsService: Send + Sync {
    async fn get_element_details(
        &self,
        element_id: ElementId,
    ) -> Result<ElementDetails, ElementDetailsError>;
}

#[derive(Debug, Error)]
pub enum ElementDetailsError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error(transparent)]
    Priority(#[from] PriorityError),
}
