use chrono::{DateTime, Duration, Local, NaiveDate, NaiveTime, TimeZone, Utc};

/// Local midnight of the current day, in UTC. Used as the schedule anchor for
/// incremental reading intervals so repeated `Next` calls on the same day compound
/// predictably regardless of what time of day the user actually studies.
pub fn start_of_today_utc() -> DateTime<Utc> {
    start_of_day_utc(Local::now().date_naive())
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
