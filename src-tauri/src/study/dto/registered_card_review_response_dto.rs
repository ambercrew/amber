use serde::Serialize;

use crate::study::dto::card_review_response_dto::CardReviewResponseDto;
use crate::study::services::card_grading_service::RegisteredReview;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredCardReviewResponseDto {
    pub review: CardReviewResponseDto,
    pub leeched: bool,
    pub suspended: bool,
}

impl From<RegisteredReview> for RegisteredCardReviewResponseDto {
    fn from(registered: RegisteredReview) -> Self {
        RegisteredCardReviewResponseDto {
            review: registered.review.into(),
            leeched: registered.leeched,
            suspended: registered.suspended,
        }
    }
}
