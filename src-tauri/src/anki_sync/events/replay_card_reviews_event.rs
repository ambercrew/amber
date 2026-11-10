use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::study::dto::card_review_request_dto::CardReviewRequestDto;
use crate::study::dto::card_review_response_dto::CardReviewResponseDto;
use crate::study::dto::study_profile_dto::StudyProfileResponseDto;
use crate::study::value_objects::rating::Rating;

pub const REPLAY_CARD_REVIEWS_EVENT: &str = "replay-card-reviews";

/// Cards to reschedule with ts-fsrs from their reviews.
#[derive(Serialize, Clone)]
pub struct ReplayCardReviewsEventDto {
    pub cards: Vec<CardHistoryDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardHistoryDto {
    pub card_id: Uuid,
    pub profile: StudyProfileResponseDto,
    /// The schedule `reviews` continue from; none replays them from a new card.
    pub start: Option<CardReviewResponseDto>,
    /// Oldest first.
    pub reviews: Vec<HistoryReviewDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryReviewDto {
    pub reviewed_at: DateTime<Utc>,
    pub rating: Rating,
}

/// The frontend's answer: each card's review state after its history, in order, or why it failed.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplayCardReviewsResponseDto {
    Reviews(Vec<CardReviewRequestDto>),
    Error(String),
}
