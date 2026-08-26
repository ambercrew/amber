use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::study::entities::card_review::CardReview;
use crate::study::value_objects::card_state::CardState;

/// A review the frontend has already scheduled with ts-fsrs, sent back for
/// persistence. Scheduling lives on the frontend because ts-fsrs implements
/// the full FSRS scheduler (state machine, learning steps, interval clamping)
/// that the `fsrs` crate leaves to its caller.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardReviewRequestDto {
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

impl From<CardReviewRequestDto> for CardReview {
    fn from(dto: CardReviewRequestDto) -> Self {
        CardReview {
            card_id: dto.card_id,
            due: dto.due,
            stability: dto.stability,
            difficulty: dto.difficulty,
            reps: dto.reps,
            lapses: dto.lapses,
            state: dto.state,
            last_reviewed: dto.last_reviewed,
            scheduled_days: dto.scheduled_days,
            learning_steps: dto.learning_steps,
        }
    }
}
