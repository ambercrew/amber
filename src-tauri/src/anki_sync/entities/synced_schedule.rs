use chrono::NaiveDate;

/// The day a card was due on in each app at the last sync; `None` where it didn't come due by the day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SyncedSchedule {
    /// Amber's local date.
    pub amber_due: Option<NaiveDate>,
    /// Anki's day number.
    pub anki_due: Option<i64>,
}
