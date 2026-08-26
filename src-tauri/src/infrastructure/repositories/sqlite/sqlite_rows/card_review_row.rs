use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::study::entities::card_review::CardReview;
use crate::study::value_objects::card_state::CardState;

pub struct CardReviewRow {
    pub card_id: Hyphenated,
    pub due: DateTime<Utc>,
    pub stability: f64,
    pub difficulty: f64,
    pub reps: i64,
    pub lapses: i64,
    pub state: String,
    pub last_reviewed: Option<DateTime<Utc>>,
    pub scheduled_days: i64,
    pub learning_steps: i64,
}

impl From<CardReviewRow> for CardReview {
    fn from(row: CardReviewRow) -> Self {
        CardReview {
            card_id: row.card_id.into_uuid(),
            due: row.due,
            stability: row.stability as f32,
            difficulty: row.difficulty as f32,
            reps: row.reps as u32,
            lapses: row.lapses as u32,
            state: CardState::from(row.state.as_str()),
            last_reviewed: row.last_reviewed,
            scheduled_days: row.scheduled_days as u32,
            learning_steps: row.learning_steps as u32,
        }
    }
}
