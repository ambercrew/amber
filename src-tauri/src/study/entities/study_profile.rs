use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::study::value_objects::priority_inheritance_policy::PriorityInheritancePolicy;
use crate::study::value_objects::step_unit::StepUnit;

/// Anki's and ts-fsrs's default maximum interval: 100 years, so FSRS alone decides.
/// The frontend's `profileFormValues.ts` and migration 0019 mirror it.
pub const DEFAULT_MAXIMUM_INTERVAL_DAYS: u32 = 36500;

/// The largest maximum interval a profile may set, as in Anki.
pub const MAX_MAXIMUM_INTERVAL_DAYS: u32 = 36500;

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
    // Incremental reading (learning_assets/extracts)
    pub initial_interval_multiplier: f32,
    /// Days added to "today" to compute the due date the first time an element is
    /// scheduled: when it's created, and for its first incremental-reading pass.
    pub initial_interval_days: f32,
    pub min_interval_days: f32,
    /// Where elements created under this profile land in the priority queue.
    pub priority_inheritance_policy: PriorityInheritancePolicy,
}
