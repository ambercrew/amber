use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::study::value_objects::leech_action::LeechAction;
use crate::study::value_objects::priority_inheritance_policy::PriorityInheritancePolicy;
use crate::study::value_objects::step_unit::StepUnit;

/// Anki's and ts-fsrs's default maximum interval: 100 years, so FSRS alone decides.
/// The frontend's `profileFormValues.ts` and migration 0019 mirror it.
pub const DEFAULT_MAXIMUM_INTERVAL_DAYS: u32 = 36500;

/// The largest maximum interval a profile may set, as in Anki.
pub const MAX_MAXIMUM_INTERVAL_DAYS: u32 = 36500;

/// Anki's defaults; the frontend's `profileFormValues.ts` and migration 0019 mirror them.
pub const DEFAULT_NEW_CARDS_PER_DAY: u32 = 20;
pub const DEFAULT_LEECH_THRESHOLD: u32 = 8;

pub const MAX_NEW_CARDS_PER_DAY: u32 = 9999;
pub const MAX_LEECH_THRESHOLD: u32 = 99;

#[derive(Debug, Clone, PartialEq)]
pub struct StudyProfile {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub name: String,
    pub is_default: bool,
    // FSRS (cards)
    pub desired_retention: f32,
    pub fsrs_params: Option<Vec<f32>>,
    /// Same-day step intervals a new card repeats before entering the
    /// long-term review schedule. `None` means "use ts-fsrs's own defaults".
    pub learning_steps: Option<Vec<StepUnit>>,
    /// Same-day step intervals a lapsed (`Again`-rated) review card repeats
    /// before returning to the long-term review schedule.
    pub relearning_steps: Option<Vec<StepUnit>>,
    /// The longest interval a card can be scheduled for, as Anki's maximum interval.
    pub maximum_interval_days: u32,
    /// How many cards never reviewed may enter the queue per day; 0 lets none in.
    pub new_cards_per_day: u32,
    /// Lapses at which a card becomes a leech, flagged again every half of it after; 0 turns it off.
    pub leech_threshold: u32,
    pub leech_action: LeechAction,
    /// Days added to "today" to compute a new card's first due date, as `initial_interval_days` does
    /// for learning assets and extracts.
    pub card_initial_interval_days: f32,
    // Incremental reading (learning_assets/extracts)
    pub initial_interval_multiplier: f32,
    /// Days added to "today" to compute the due date the first time an element is
    /// scheduled: when it's created, and for its first incremental-reading pass.
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
    /// Where elements created under this profile land in the priority queue.
    pub priority_inheritance_policy: PriorityInheritancePolicy,
}
