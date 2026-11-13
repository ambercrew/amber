use chrono::NaiveDate;

/// When a newly created card first comes due.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum NewCardDue {
    /// After its study profile's initial interval.
    #[default]
    FromProfile,
    /// From the start of this local date.
    On(NaiveDate),
}
