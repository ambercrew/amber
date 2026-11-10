use chrono::{DateTime, Duration, Local, NaiveDate, NaiveTime, TimeZone, Utc};

/// Local midnight of the current day, in UTC. Used as the schedule anchor for
/// incremental reading intervals so repeated `Next` calls on the same day compound
/// predictably regardless of what time of day the user actually studies.
pub fn start_of_today_utc() -> DateTime<Utc> {
    start_of_day_utc(Local::now().date_naive())
}

/// The local calendar day `time` falls on.
pub fn local_date(time: DateTime<Utc>) -> NaiveDate {
    time.with_timezone(&Local).date_naive()
}

/// Local midnight of the day `due` falls on, so a card due that day shows up for all of it.
pub fn start_of_due_day(due: DateTime<Utc>) -> DateTime<Utc> {
    start_of_day_utc(local_date(due))
}

/// Local midnight of `date`, in UTC; when a DST jump skips midnight, the first
/// valid local time after it.
pub fn start_of_day_utc(date: NaiveDate) -> DateTime<Utc> {
    let midnight = date.and_time(NaiveTime::MIN);
    Local
        .from_local_datetime(&midnight)
        .earliest()
        .or_else(|| {
            Local
                .from_local_datetime(&(midnight + Duration::hours(1)))
                .earliest()
        })
        .map_or_else(|| midnight.and_utc(), |start| start.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_of_due_day_afternoon_due_returns_that_days_midnight() {
        // Arrange

        let date = NaiveDate::from_ymd_opt(2026, 3, 14).unwrap();
        let afternoon = Local
            .from_local_datetime(&date.and_hms_opt(15, 30, 0).unwrap())
            .unwrap()
            .with_timezone(&Utc);

        // Act

        let start = start_of_due_day(afternoon);

        // Assert

        assert_eq!(start_of_day_utc(date), start);
        assert_eq!(date, local_date(start));
    }
}
