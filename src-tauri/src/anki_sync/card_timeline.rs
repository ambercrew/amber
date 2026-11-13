use super::card_decision::CardSides;
use super::reviews::{is_reschedule, is_reset, is_review};
use super::schedules::ScheduleSource;

/// What an event did to the card.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Review,
    /// A due date moved without a review.
    DueMove,
    /// Back to a new card.
    Reset,
    /// Anything else Anki logs, such as an entry without a rating.
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CardEvent {
    pub source: ScheduleSource,
    pub kind: EventKind,
    /// Milliseconds, the precision Anki logs in; Amber's events fall on whole seconds.
    pub at_ms: i64,
}

impl CardEvent {
    /// Events from the two apps compare by the second, the precision Amber stores.
    pub fn second(&self) -> i64 {
        self.at_ms.div_euclid(1000)
    }
}

/// Everything either app did to one card, so each rule asks who acted last rather than working it out again.
pub struct CardTimeline {
    events: Vec<CardEvent>,
}

impl CardTimeline {
    pub fn of(sides: &CardSides) -> Self {
        let amber = |kind, at: chrono::DateTime<chrono::Utc>| CardEvent {
            source: ScheduleSource::Amber,
            kind,
            at_ms: at.timestamp() * 1000,
        };
        let mut events: Vec<CardEvent> = sides
            .amber_logs
            .iter()
            .map(|log| amber(EventKind::Review, log.reviewed_at))
            .chain(
                sides
                    .amber_review
                    .and_then(|review| review.last_reviewed)
                    .map(|at| amber(EventKind::Review, at)),
            )
            .chain(
                sides
                    .amber_due_moved_at
                    .map(|at| amber(EventKind::DueMove, at)),
            )
            .chain(sides.amber_reset_at.map(|at| amber(EventKind::Reset, at)))
            .collect();
        events.extend(sides.anki_reviews.iter().map(|review| CardEvent {
            source: ScheduleSource::Anki,
            kind: if is_review(review) {
                EventKind::Review
            } else if is_reset(review) {
                EventKind::Reset
            } else if is_reschedule(review) {
                EventKind::DueMove
            } else {
                EventKind::Other
            },
            at_ms: review.id,
        }));
        events.sort_by_key(|event| event.at_ms);
        Self { events }
    }

    /// One app's events, oldest first.
    pub fn of_source(&self, source: ScheduleSource) -> impl Iterator<Item = &CardEvent> {
        self.events
            .iter()
            .filter(move |event| event.source == source)
    }

    /// The newest of one app's events that `kind` accepts.
    pub fn latest(
        &self,
        source: ScheduleSource,
        kind: impl Fn(EventKind) -> bool,
    ) -> Option<&CardEvent> {
        self.of_source(source)
            .filter(|event| kind(event.kind))
            .last()
    }

    /// The second of one app's newest event of any kind.
    pub fn last_touch(&self, source: ScheduleSource) -> Option<i64> {
        self.latest(source, |_| true).map(CardEvent::second)
    }

    /// The second of the newest review in either app.
    pub fn last_review(&self) -> Option<i64> {
        self.events
            .iter()
            .filter(|event| event.kind == EventKind::Review)
            .map(CardEvent::second)
            .max()
    }

    /// The app whose newest event is a due move, later than anything else either app did. Amber's move must
    /// also be later than its own reset, which moves the due date in the same second.
    pub fn moved_last(&self) -> Option<ScheduleSource> {
        let amber = self.last_touch(ScheduleSource::Amber);
        let anki = self.last_touch(ScheduleSource::Anki);
        let amber_move = self
            .latest(ScheduleSource::Amber, |kind| kind == EventKind::DueMove)
            .map(CardEvent::second);
        let amber_other = self
            .latest(ScheduleSource::Amber, |kind| kind != EventKind::DueMove)
            .map(CardEvent::second);
        if let Some(moved) = amber_move
            && amber_other.is_none_or(|other| moved > other)
            && anki.is_none_or(|anki| moved > anki)
        {
            return Some(ScheduleSource::Amber);
        }
        let anki_newest = self.latest(ScheduleSource::Anki, |_| true)?;
        let anki_moved = anki_newest.kind == EventKind::DueMove
            && amber.is_none_or(|amber| anki_newest.second() > amber);
        anki_moved.then_some(ScheduleSource::Anki)
    }
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;
    use uuid::Uuid;

    use super::*;
    use crate::anki_sync::anki_connect::AnkiReview;
    use crate::study::entities::card_review_log::CardReviewLog;
    use crate::study::value_objects::rating::Rating;

    fn amber_log(second: i64) -> CardReviewLog {
        CardReviewLog {
            id: Uuid::new_v4(),
            card_id: None,
            reviewed_at: DateTime::from_timestamp(second, 0).unwrap(),
            rating: Rating::Good,
            duration_ms: None,
        }
    }

    fn anki_log(second: i64, ease: i64, kind: i64, ivl: i64) -> AnkiReview {
        AnkiReview {
            id: second * 1000,
            ease,
            time: 0,
            ivl,
            kind,
        }
    }

    fn sides<'a>(
        amber_logs: &'a [CardReviewLog],
        anki_reviews: &'a [AnkiReview],
        amber_due_moved_at: Option<i64>,
        amber_reset_at: Option<i64>,
    ) -> CardSides<'a> {
        CardSides {
            amber_logs,
            anki_reviews,
            amber_review: None,
            amber_due_moved_at: amber_due_moved_at.and_then(|at| DateTime::from_timestamp(at, 0)),
            amber_reset_at: amber_reset_at.and_then(|at| DateTime::from_timestamp(at, 0)),
            anki_schedule: None,
            synced: None,
        }
    }

    #[test]
    fn of_anki_entries_returns_each_kind() {
        // Arrange

        let anki = [
            anki_log(10, 3, 1, 3),
            anki_log(20, 0, 4, 0),
            anki_log(30, 0, 4, 5),
            anki_log(40, 0, 3, 0),
        ];
        let sides = sides(&[], &anki, None, None);

        // Act

        let timeline = CardTimeline::of(&sides);

        // Assert

        let kinds: Vec<EventKind> = timeline
            .of_source(ScheduleSource::Anki)
            .map(|event| event.kind)
            .collect();
        let expected = vec![
            EventKind::Review,
            EventKind::Reset,
            EventKind::DueMove,
            EventKind::Other,
        ];
        assert_eq!(expected, kinds);
    }

    #[test]
    fn moved_last_amber_move_after_everything_returns_amber() {
        // Arrange

        let amber = [amber_log(10)];
        let anki = [anki_log(20, 0, 4, 5)];
        let sides = sides(&amber, &anki, Some(30), None);

        // Act

        let moved = CardTimeline::of(&sides).moved_last();

        // Assert

        assert_eq!(Some(ScheduleSource::Amber), moved);
    }

    #[test]
    fn moved_last_anki_move_after_everything_returns_anki() {
        // Arrange

        let amber = [amber_log(10)];
        let anki = [anki_log(30, 0, 4, 5)];
        let sides = sides(&amber, &anki, Some(20), None);

        // Act

        let moved = CardTimeline::of(&sides).moved_last();

        // Assert

        assert_eq!(Some(ScheduleSource::Anki), moved);
    }

    #[test]
    fn moved_last_amber_move_in_the_second_of_its_reset_returns_none() {
        // Arrange

        let sides = sides(&[], &[], Some(20), Some(20));

        // Act

        let moved = CardTimeline::of(&sides).moved_last();

        // Assert

        assert_eq!(None, moved);
    }

    #[test]
    fn moved_last_review_after_the_moves_returns_none() {
        // Arrange

        let anki = [anki_log(20, 0, 4, 5), anki_log(30, 3, 1, 3)];
        let sides = sides(&[], &anki, Some(10), None);

        // Act

        let moved = CardTimeline::of(&sides).moved_last();

        // Assert

        assert_eq!(None, moved);
    }
}
