use serde::Serialize;

use crate::study::dto::card_review_response_dto::CardReviewResponseDto;
use crate::study::dto::study_profile_dto::StudyProfileResponseDto;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::study_profile::StudyProfile;

/// What the frontend needs to schedule a card with ts-fsrs: its review state and the study profile
/// it inherits.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardSchedulingDto {
    pub review: CardReviewResponseDto,
    pub profile: StudyProfileResponseDto,
}

impl From<(CardReview, StudyProfile)> for CardSchedulingDto {
    fn from((review, profile): (CardReview, StudyProfile)) -> Self {
        CardSchedulingDto {
            review: review.into(),
            profile: profile.into(),
        }
    }
}
