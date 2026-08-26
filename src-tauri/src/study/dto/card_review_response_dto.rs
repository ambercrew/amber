use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::study::entities::card_review::CardReview;
use crate::study::value_objects::card_state::CardState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardReviewResponseDto {
    pub card_id: Uuid,
    pub due: DateTime<Utc>,
    pub stability: f32,
    pub difficulty: f32,
    pub reps: u32,
    pub lapses: u32,
    pub state: CardState,
    pub last_reviewed: Option<DateTime<Utc>>,
    pub scheduled_days: u32,
    pub learning_steps: u32,
}

impl From<CardReview> for CardReviewResponseDto {
    fn from(review: CardReview) -> Self {
        CardReviewResponseDto {
            card_id: review.card_id,
            due: review.due,
            stability: review.stability,
            difficulty: review.difficulty,
            reps: review.reps,
            lapses: review.lapses,
            state: review.state,
            last_reviewed: review.last_reviewed,
            scheduled_days: review.scheduled_days,
            learning_steps: review.learning_steps,
        }
    }
}
