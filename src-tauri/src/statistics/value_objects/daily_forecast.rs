use chrono::NaiveDate;

/// Reviews scheduled for one future local calendar day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DailyForecast {
    pub date: NaiveDate,
    pub reviews: u32,
}
