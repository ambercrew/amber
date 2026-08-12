use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::study::entities::study_profile::StudyProfile;
use crate::study::utils::day_boundary::start_of_today_utc;
use crate::study::value_objects::card_state::CardState;

#[derive(Debug, Clone, PartialEq)]
pub struct CardReview {
    pub card_id: Uuid,
    pub due: DateTime<Utc>,
    pub stability: f32,
    pub difficulty: f32,
    pub reps: u32,
    pub lapses: u32,
    pub state: CardState,
    pub last_reviewed: Option<DateTime<Utc>>,
}

impl CardReview {
    pub fn new_for_profile(card_id: Uuid, profile: &StudyProfile) -> CardReview {
        CardReview {
            card_id,
            due: start_of_today_utc()
                + Duration::seconds((profile.initial_interval_days as f64 * 86400.0).round() as i64),
            stability: 0.0,
            difficulty: 0.0,
            reps: 0,
            lapses: 0,
            state: CardState::New,
            last_reviewed: None,
        }
    }
}
