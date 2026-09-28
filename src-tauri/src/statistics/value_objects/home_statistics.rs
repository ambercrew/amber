use crate::statistics::value_objects::daily_activity::DailyActivity;
use crate::statistics::value_objects::daily_forecast::DailyForecast;
use crate::statistics::value_objects::element_counts::ElementCounts;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HomeStatistics {
    pub element_counts: ElementCounts,
    pub today_study_duration_ms: u64,
    /// Only days with at least one review, oldest first.
    pub daily_activity: Vec<DailyActivity>,
    /// Only future days with at least one due review, soonest first.
    pub daily_forecast: Vec<DailyForecast>,
}
