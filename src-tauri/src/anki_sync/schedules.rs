use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use serde::Deserialize;

use super::entities::synced_schedule::SyncedSchedule;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::study::entities::card_review::CardReview;
use crate::study::utils::day_boundary::{local_date, start_of_day_utc};
use crate::study::value_objects::card_state::CardState;

/// Anki's default hour for its day to start; AnkiConnect can't tell which one the user chose.
const ANKI_ROLLOVER_HOURS: i64 = 4;
const LEARNING_QUEUE: i64 = 1;
const REVIEW_QUEUE: i64 = 2;
const DAY_LEARNING_QUEUE: i64 = 3;
const REVIEW_TYPE: i64 = 2;

/// A card's place in Anki's schedule, from `cardsInfo`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiCardSchedule {
    pub card_id: AnkiCardId,
    /// A day number for review cards, a timestamp in seconds for learning ones, a position for new ones.
    pub due: i64,
    pub queue: i64,
    #[serde(rename = "type")]
    pub kind: i64,
    pub interval: i64,
}

impl AnkiCardSchedule {
    /// The day number the card is due on, for cards that come due by the day; suspended or buried
    /// review cards keep theirs.
    pub fn due_day(&self) -> Option<i64> {
        let by_day = matches!(self.queue, REVIEW_QUEUE | DAY_LEARNING_QUEUE)
            || (self.queue < 0 && self.kind == REVIEW_TYPE);
        by_day.then_some(self.due)
    }

    /// A graduated card, not a new or (re)learning one.
    pub fn is_review(&self) -> bool {
        self.kind == REVIEW_TYPE
    }

    /// Answering a suspended or buried card would bring it back into Anki's queue.
    pub fn is_answerable(&self) -> bool {
        self.queue >= 0
    }

    /// Whether `prop:due` searches find the card, which only looks at these queues.
    pub fn is_searchable_by_due(&self) -> bool {
        matches!(self.queue, REVIEW_QUEUE | DAY_LEARNING_QUEUE)
    }

    /// When the card comes due, as Amber stores it: day-due cards at the start of their day.
    pub fn amber_due(&self, today: Option<&AnkiToday>) -> Option<DateTime<Utc>> {
        match (self.due_day(), today) {
            (Some(day), Some(today)) => Some(start_of_day_utc(today.date_of(day))),
            (Some(_), None) => None,
            (None, _) if self.queue == LEARNING_QUEUE => DateTime::from_timestamp(self.due, 0),
            (None, _) => None,
        }
    }
}

/// Anki's day number for today and the calendar day it falls on, to turn due days into dates and back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnkiToday {
    pub day: i64,
    pub date: NaiveDate,
}

impl AnkiToday {
    pub fn new(day: i64, now: DateTime<Utc>) -> Self {
        Self {
            day,
            date: anki_date(now),
        }
    }

    pub fn date_of(&self, day: i64) -> NaiveDate {
        self.date + Duration::days(day - self.day)
    }
}

/// The calendar day Anki counts `time` in: before its rollover, it's still the day before.
pub fn anki_date(time: DateTime<Utc>) -> NaiveDate {
    (time.with_timezone(&Local) - Duration::hours(ANKI_ROLLOVER_HOURS)).date_naive()
}

/// The day an Amber card is due on, for cards scheduled at least a day ahead.
pub fn amber_due_day(review: Option<&CardReview>) -> Option<NaiveDate> {
    review
        .filter(|review| review.state != CardState::New && review.scheduled_days >= 1)
        .map(|review| local_date(review.due))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleSource {
    Amber,
    Anki,
}

/// Whose due day a card without new reviews should take: the app that moved it since the last sync, or
/// when both did, or there was no last sync, the one that touched the card last. `None` when they agree,
/// counting every day up to today as today.
pub fn schedule_to_take(
    last: Option<&SyncedSchedule>,
    current: &SyncedSchedule,
    today: &AnkiToday,
    amber_touched_last: bool,
) -> Option<ScheduleSource> {
    let (Some(amber), Some(anki)) = (current.amber_due, current.anki_due) else {
        return None;
    };
    // Anki can't hold a day before today, so a card overdue in Amber is due today there.
    if today.date_of(anki).max(today.date) == amber.max(today.date) {
        return None;
    }
    let amber_moved = last.is_none_or(|last| last.amber_due != current.amber_due);
    let anki_moved = last.is_none_or(|last| last.anki_due != current.anki_due);
    Some(match (amber_moved, anki_moved) {
        (true, false) => ScheduleSource::Amber,
        (false, true) => ScheduleSource::Anki,
        _ if amber_touched_last => ScheduleSource::Amber,
        _ => ScheduleSource::Anki,
    })
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    const TODAY: i64 = 100;

    fn today() -> AnkiToday {
        AnkiToday {
            day: TODAY,
            date: NaiveDate::from_ymd_opt(2026, 3, 10).unwrap(),
        }
    }

    fn date(day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 3, day).unwrap()
    }

    fn synced(amber_day: u32, anki_day: i64) -> SyncedSchedule {
        SyncedSchedule {
            amber_due: Some(date(amber_day)),
            anki_due: Some(anki_day),
        }
    }

    fn schedule(due: i64, queue: i64, kind: i64) -> AnkiCardSchedule {
        AnkiCardSchedule {
            card_id: AnkiCardId(1),
            due,
            queue,
            kind,
            interval: 3,
        }
    }

    #[test]
    fn schedule_to_take_overdue_in_amber_and_due_today_in_anki_returns_none() {
        // Arrange

        let last = synced(4, TODAY);
        let current = synced(4, TODAY);

        // Act

        let source = schedule_to_take(Some(&last), &current, &today(), true);

        // Assert

        assert_eq!(None, source);
    }

    #[test]
    fn schedule_to_take_only_anki_moved_returns_anki() {
        // Arrange

        let last = synced(12, TODAY + 2);
        let current = synced(12, TODAY + 5);

        // Act

        let source = schedule_to_take(Some(&last), &current, &today(), true);

        // Assert

        assert_eq!(Some(ScheduleSource::Anki), source);
    }

    #[test]
    fn schedule_to_take_only_amber_moved_returns_amber() {
        // Arrange

        let last = synced(12, TODAY + 2);
        let current = synced(15, TODAY + 2);

        // Act

        let source = schedule_to_take(Some(&last), &current, &today(), false);

        // Assert

        assert_eq!(Some(ScheduleSource::Amber), source);
    }

    #[test]
    fn schedule_to_take_both_moved_returns_the_one_touched_last() {
        // Arrange

        let last = synced(12, TODAY + 2);
        let current = synced(15, TODAY + 7);

        // Act

        let source = schedule_to_take(Some(&last), &current, &today(), false);

        // Assert

        assert_eq!(Some(ScheduleSource::Anki), source);
    }

    #[test]
    fn schedule_to_take_same_day_returns_none() {
        // Arrange

        let current = synced(13, TODAY + 3);

        // Act

        let source = schedule_to_take(None, &current, &today(), true);

        // Assert

        assert_eq!(None, source);
    }

    #[test]
    fn due_day_suspended_review_card_keeps_its_day() {
        // Arrange

        let suspended = schedule(TODAY + 4, -1, REVIEW_TYPE);

        // Act

        let day = suspended.due_day();

        // Assert

        assert_eq!(Some(TODAY + 4), day);
    }

    #[test]
    fn amber_due_learning_card_returns_its_timestamp() {
        // Arrange

        let learning = schedule(1_800_000_000, LEARNING_QUEUE, 1);

        // Act

        let due = learning.amber_due(Some(&today()));

        // Assert

        assert_eq!(DateTime::from_timestamp(1_800_000_000, 0), due);
    }

    #[test]
    fn anki_date_before_rollover_returns_the_day_before() {
        // Arrange

        let night = Local
            .from_local_datetime(&date(10).and_hms_opt(2, 0, 0).unwrap())
            .unwrap()
            .with_timezone(&Utc);

        // Act

        let day = anki_date(night);

        // Assert

        assert_eq!(date(9), day);
    }
}
