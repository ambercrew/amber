use chrono::NaiveDate;

/// Reviews done and time spent studying on one local calendar day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DailyActivity {
    pub date: NaiveDate,
    pub reviews: u32,
    pub duration_ms: u64,
}
