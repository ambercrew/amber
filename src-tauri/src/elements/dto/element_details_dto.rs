use serde::Serialize;

use crate::bibliographical_sources::dto::bibliographical_source_dto::BibliographicalSourceResponseDto;
use crate::elements::dto::priority_info_dto::PriorityInfoResponseDto;
use crate::elements::services::element_details_service::ElementDetails;
use crate::study::dto::card_review_response_dto::CardReviewResponseDto;
use crate::study::dto::learning_asset_review_dto::LearningAssetReviewResponseDto;
use crate::study::dto::study_profile_dto::{EffectiveProfileResponseDto, StudyProfileResponseDto};

/// Everything the Aside details panel needs for the currently viewed
/// element, gathered in one round trip instead of one call per section.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDetailsResponseDto {
    pub bibliographical_source: Option<BibliographicalSourceResponseDto>,
    pub derived_from_name: Option<String>,
    pub card_review: Option<CardReviewResponseDto>,
    pub learning_asset_review: Option<LearningAssetReviewResponseDto>,
    pub effective_profile: EffectiveProfileResponseDto,
    pub profiles: Vec<StudyProfileResponseDto>,
    /// Name to display for the "inherit from parent" option: the parent's
    /// (or app-wide default's) profile name when this element's profile is
    /// direct, otherwise the effective profile's own name.
    pub inherited_profile_name: Option<String>,
    pub priority: PriorityInfoResponseDto,
}

impl From<ElementDetails> for ElementDetailsResponseDto {
    fn from(details: ElementDetails) -> Self {
        ElementDetailsResponseDto {
            bibliographical_source: details.bibliographical_source.map(Into::into),
            derived_from_name: details.derived_from_name,
            card_review: details.card_review.map(Into::into),
            learning_asset_review: details.learning_asset_review.map(Into::into),
            effective_profile: details.effective_profile.into(),
            profiles: details.profiles.into_iter().map(Into::into).collect(),
            inherited_profile_name: details.inherited_profile_name,
            priority: details.priority.into(),
        }
    }
}
