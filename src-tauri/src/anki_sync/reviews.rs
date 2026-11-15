use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, NaiveDate, Utc};
use uuid::Uuid;

use super::anki_connect::{
    AGAIN_EASE, AnkiCardValues, AnkiReview, AnkiReviewRow, free_id_in_second,
};
use super::schedules::{AnkiCardSchedule, AnkiToday, anki_date};
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::utils::day_boundary::{local_date, start_of_day_utc};
use crate::study::value_objects::card_state::CardState;
use crate::study::value_objects::rating::Rating;

/// Anki's review log types up to filtered-deck reviews; manual reschedules (4, 5) aren't reviews.
const LAST_REVIEW_KIND: i64 = 3;
const MANUAL_KIND: i64 = 4;
const RESCHEDULED_KIND: i64 = 5;
const LEARNING_KIND: i64 = 0;
const REVIEW_KIND: i64 = 1;

/// An answer to the card, as opposed to a reschedule.
pub fn is_review(review: &AnkiReview) -> bool {
    (1..=4).contains(&review.ease) && review.kind <= LAST_REVIEW_KIND
}

/// A due date set by hand or by rescheduling, without an answer.
pub fn is_reschedule(review: &AnkiReview) -> bool {
    matches!(review.kind, MANUAL_KIND | RESCHEDULED_KIND)
}

/// A reset to a new card ("Forget"), which Anki logs as a manual entry without an interval; a due date set by
/// hand always logs one of a day or more.
pub fn is_reset(review: &AnkiReview) -> bool {
    review.kind == MANUAL_KIND && review.ease == 0 && review.ivl == 0
}

/// What one card needs so both sides hold its whole review history.
#[derive(Debug, PartialEq)]
pub struct ReviewMerge {
    /// Anki's reviews that Amber lacks.
    pub pulled: Vec<CardReviewLog>,
    /// Amber's reviews that Anki lacks.
    pub pushed: Vec<AnkiReviewRow>,
    /// Amber holds the newest review, so Anki should take Amber's schedule.
    pub amber_is_newer: bool,
    /// Anki holds the newest review, so Amber should take this from it.
    pub anki_next_review: Option<AnkiNextReview>,
}

/// When Anki's newest review set a card's next one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnkiNextReview {
    pub due: DateTime<Utc>,
    /// None for a learning step, whose interval is under a day.
    pub scheduled_days: Option<u32>,
}

impl AnkiNextReview {
    /// None when the review set no interval, as in a filtered deck that doesn't reschedule.
    fn from_review(review: &AnkiReview) -> Option<Self> {
        let reviewed_at = DateTime::from_timestamp(review.id.div_euclid(1000), 0)?;
        match review.ivl {
            0 => None,
            // Counted from the day Anki reviewed it on, as Anki does.
            days if days > 0 => Some(Self {
                due: start_of_day_utc(anki_date(reviewed_at) + Duration::days(days)),
                scheduled_days: u32::try_from(days).ok(),
            }),
            seconds => Some(Self {
                due: reviewed_at + Duration::seconds(-seconds),
                scheduled_days: None,
            }),
        }
    }

    /// The card's due date as Anki holds it now, which a reschedule since its last review may have moved.
    pub fn from_schedule(schedule: &AnkiCardSchedule, today: Option<&AnkiToday>) -> Option<Self> {
        let due = schedule.amber_due(today)?;
        let scheduled_days = schedule
            .due_day()
            .and_then(|_| u32::try_from(schedule.interval).ok())
            .filter(|days| *days > 0);
        Some(Self {
            due,
            scheduled_days,
        })
    }

    /// The side a card was reviewed on last decides its due date; the replay keeps its memory state.
    pub fn apply_to(&self, review: &mut CardReview) {
        // A due day before the card's last review can't be Anki's schedule for it.
        if review
            .last_reviewed
            .is_some_and(|last| self.due < start_of_day_utc(local_date(last)))
        {
            return;
        }
        review.due = self.due;
        // A new card's due date moves alone, as Amber's own `set_due` moves it.
        if let Some(days) = self
            .scheduled_days
            .filter(|_| review.state != CardState::New)
        {
            review.scheduled_days = days;
        }
    }
}

/// Reviews match by the second they happened in, the precision Amber stores.
pub fn merge_reviews(
    card_id: Uuid,
    anki_card: AnkiCardId,
    amber: &[CardReviewLog],
    anki: &[AnkiReview],
) -> ReviewMerge {
    let anki: Vec<&AnkiReview> = anki.iter().filter(|review| is_review(review)).collect();
    let anki_seconds: HashSet<i64> = anki
        .iter()
        .map(|review| review.id.div_euclid(1000))
        .collect();
    let amber_seconds: HashSet<i64> = amber
        .iter()
        .map(|log| log.reviewed_at.timestamp())
        .collect();
    let first = anki_seconds.iter().chain(&amber_seconds).min().copied();

    let pulled = anki
        .iter()
        .filter(|review| !amber_seconds.contains(&review.id.div_euclid(1000)))
        .filter_map(|review| {
            Some(CardReviewLog {
                id: pulled_review_id(card_id, review.id.div_euclid(1000)),
                card_id: Some(card_id),
                reviewed_at: DateTime::from_timestamp(review.id.div_euclid(1000), 0)?,
                rating: rating(review.ease),
                duration_ms: u32::try_from(review.time).ok().filter(|time| *time > 0),
            })
        })
        .collect();
    let pushed = amber
        .iter()
        .filter(|log| !anki_seconds.contains(&log.reviewed_at.timestamp()))
        .map(|log| {
            let second = log.reviewed_at.timestamp();
            let kind = if Some(second) == first {
                LEARNING_KIND
            } else {
                REVIEW_KIND
            };
            // Anki's review ids are unique across cards, so the card spreads same-second reviews apart.
            AnkiReviewRow {
                id: second * 1000 + anki_card.0.rem_euclid(1000),
                card_id: anki_card,
                ease: ease(log.rating),
                time_ms: i64::from(log.duration_ms.unwrap_or(0)),
                kind,
            }
        })
        .collect();

    let newest_amber = amber_seconds.iter().max();
    let newest_anki = anki_seconds.iter().max();
    let anki_next_review = (newest_anki > newest_amber)
        .then(|| anki.iter().max_by_key(|review| review.id))
        .flatten()
        .and_then(|review| AnkiNextReview::from_review(review));

    ReviewMerge {
        pulled,
        pushed,
        amber_is_newer: newest_amber > newest_anki,
        anki_next_review,
    }
}

/// The same on every device that pulls the review, so cloud sync merges their copies into one row.
fn pulled_review_id(card_id: Uuid, second: i64) -> Uuid {
    Uuid::new_v5(&card_id, &second.to_be_bytes())
}

/// Gives Anki's reviews made by answering for one of Amber's the second of that review, so they match it.
/// `answered` maps an Anki review id to that second.
pub fn match_answered_reviews(
    reviews: &mut HashMap<AnkiCardId, Vec<AnkiReview>>,
    answered: &HashMap<i64, i64>,
) {
    for review in reviews.values_mut().flatten() {
        if let Some(second) = answered.get(&review.id) {
            review.id = second * 1000 + review.id.rem_euclid(1000);
        }
    }
}

/// Whether Anki should answer the card for Amber's newest review rather than log it, so it enters Anki's
/// (re)learning steps as it did Amber's: Amber reviewed last and left the card (re)learning. Only Again
/// answers a review card, as another rating would give it days Amber didn't.
pub fn answers_in_anki(
    merge: &ReviewMerge,
    review: Option<&CardReview>,
    schedule: &AnkiCardSchedule,
) -> bool {
    merge.amber_is_newer
        && schedule.is_answerable()
        && merge
            .pushed
            .iter()
            .max_by_key(|row| row.id)
            .is_some_and(|row| row.ease == AGAIN_EASE || !schedule.is_review())
        && review.is_some_and(|review| {
            matches!(review.state, CardState::Learning | CardState::Relearning)
        })
}

/// Anki's review log is keyed by id alone, and one clash fails the whole insert on every sync; `taken` are
/// the ids Anki already holds. A clashing id stays in its second, which is what the next sync matches it by.
pub fn spread_review_ids(rows: &mut [AnkiReviewRow], taken: impl IntoIterator<Item = i64>) {
    let mut used: HashSet<i64> = taken.into_iter().collect();
    for row in rows {
        if !used.insert(row.id) {
            row.id = free_id_in_second(row.id, &mut used).unwrap_or(row.id);
        }
    }
}

/// Amber's schedule as Anki can take it: AnkiConnect only sets due dates, so a card still in its learning
/// steps comes due today as a review.
#[derive(Debug, PartialEq, Eq)]
pub struct AnkiSchedule {
    pub due_in_days: i64,
    /// None for a card Amber holds as new, whose due date alone was moved.
    pub values: Option<AnkiCardValues>,
}

/// Amber's schedule as Anki takes it; `anki_today` is the calendar day Anki counts today as.
pub fn anki_schedule(review: &CardReview, anki_today: NaiveDate) -> AnkiSchedule {
    let values = (review.state != CardState::New).then(|| AnkiCardValues {
        interval_days: Some(i64::from(review.scheduled_days.max(1))),
        ..anki_counts(review)
    });
    AnkiSchedule {
        due_in_days: (local_date(review.due) - anki_today).num_days().max(0),
        values,
    }
}

/// The review and lapse counts Amber holds for a card, which Anki's own don't include for logged reviews.
pub fn anki_counts(review: &CardReview) -> AnkiCardValues {
    AnkiCardValues {
        interval_days: None,
        reps: i64::from(review.reps),
        lapses: i64::from(review.lapses),
    }
}

fn rating(ease: i64) -> Rating {
    match ease {
        2 => Rating::Hard,
        3 => Rating::Good,
        4 => Rating::Easy,
        _ => Rating::Again,
    }
}

fn ease(rating: Rating) -> i64 {
    match rating {
        Rating::Again => AGAIN_EASE,
        Rating::Hard => 2,
        Rating::Good => 3,
        Rating::Easy => 4,
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    const ANKI_CARD: AnkiCardId = AnkiCardId(1_793_736_930_500);

    fn row(id: i64, ease: i64, time_ms: i64, kind: i64) -> AnkiReviewRow {
        AnkiReviewRow {
            id,
            card_id: ANKI_CARD,
            ease,
            time_ms,
            kind,
        }
    }

    fn amber_log(second: i64, rating: Rating) -> CardReviewLog {
        CardReviewLog {
            id: Uuid::new_v4(),
            card_id: None,
            reviewed_at: DateTime::from_timestamp(second, 0).unwrap(),
            rating,
            duration_ms: Some(1500),
        }
    }

    fn anki_review(millis: i64, ease: i64, kind: i64) -> AnkiReview {
        AnkiReview {
            id: millis,
            ease,
            time: 4000,
            ivl: 12,
            kind,
        }
    }

    #[test]
    fn merge_reviews_each_side_gets_the_reviews_it_lacks() {
        // Arrange

        let card_id = Uuid::new_v4();
        let amber = [
            amber_log(1_000, Rating::Good),
            amber_log(3_000, Rating::Hard),
        ];
        let anki = [anki_review(1_000_250, 3, 0), anki_review(2_000_999, 1, 1)];

        // Act

        let merge = merge_reviews(card_id, ANKI_CARD, &amber, &anki);

        // Assert

        assert_eq!(1, merge.pulled.len());
        assert_eq!(2_000, merge.pulled[0].reviewed_at.timestamp());
        assert_eq!(Rating::Again, merge.pulled[0].rating);
        assert_eq!(Some(card_id), merge.pulled[0].card_id);
        assert_eq!(vec![row(3_000_500, 2, 1500, REVIEW_KIND)], merge.pushed);
        assert!(merge.amber_is_newer);
    }

    #[test]
    fn merge_reviews_same_anki_review_pulled_twice_gets_the_same_id() {
        // Arrange

        let card_id = Uuid::new_v4();
        let anki = [anki_review(2_000_999, 3, 1)];

        // Act

        let first = merge_reviews(card_id, ANKI_CARD, &[], &anki);
        let second = merge_reviews(card_id, ANKI_CARD, &[], &anki);

        // Assert

        assert_eq!(first.pulled[0].id, second.pulled[0].id);
        let other_card = merge_reviews(Uuid::new_v4(), ANKI_CARD, &[], &anki);
        assert_ne!(first.pulled[0].id, other_card.pulled[0].id);
    }

    #[test]
    fn merge_reviews_anki_reviewed_last_gives_its_next_review() {
        // Arrange

        let amber = [amber_log(1_000, Rating::Good)];
        let anki = [anki_review(2_000_999, 3, 1)];

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &amber, &anki);

        // Assert

        let reviewed_at = DateTime::from_timestamp(2_000, 0).unwrap();
        let expected = AnkiNextReview {
            due: start_of_day_utc(anki_date(reviewed_at) + Duration::days(12)),
            scheduled_days: Some(12),
        };
        assert_eq!(Some(expected), merge.anki_next_review);
    }

    #[test]
    fn merge_reviews_learning_step_in_anki_due_in_its_seconds() {
        // Arrange

        let mut review = anki_review(2_000_000, 1, 0);
        review.ivl = -600;

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &[], &[review]);

        // Assert

        let expected = AnkiNextReview {
            due: DateTime::from_timestamp(2_600, 0).unwrap(),
            scheduled_days: None,
        };
        assert_eq!(Some(expected), merge.anki_next_review);
    }

    #[test]
    fn merge_reviews_amber_reviewed_last_gives_no_next_review() {
        // Arrange

        let amber = [amber_log(3_000, Rating::Good)];
        let anki = [anki_review(2_000_000, 3, 1)];

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &amber, &anki);

        // Assert

        assert_eq!(None, merge.anki_next_review);
    }

    #[test]
    fn merge_reviews_review_without_interval_gives_no_next_review() {
        // Arrange

        let mut review = anki_review(2_000_000, 3, 3);
        review.ivl = 0;

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &[], &[review]);

        // Assert

        assert_eq!(None, merge.anki_next_review);
    }

    #[test]
    fn merge_reviews_manual_reschedules_are_ignored() {
        // Arrange

        let anki = [anki_review(5_000_000, 0, 4), anki_review(6_000_000, 3, 5)];

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &[], &anki);

        // Assert

        assert!(merge.pulled.is_empty());
        assert!(!merge.amber_is_newer);
    }

    #[test]
    fn merge_reviews_first_review_pushed_as_learning() {
        // Arrange

        let amber = [amber_log(1_000, Rating::Good)];

        // Act

        let merge = merge_reviews(Uuid::new_v4(), ANKI_CARD, &amber, &[]);

        // Assert

        assert_eq!(LEARNING_KIND, merge.pushed[0].kind);
    }

    #[test]
    fn spread_review_ids_same_second_reviews_get_their_own_ids() {
        // Arrange

        let mut rows = [
            row(1_000_500, 3, 0, REVIEW_KIND),
            row(1_000_500, 1, 0, REVIEW_KIND),
            row(1_000_501, 1, 0, REVIEW_KIND),
        ];

        // Act

        spread_review_ids(&mut rows, []);

        // Assert

        let ids: Vec<i64> = rows.iter().map(|row| row.id).collect();
        assert_eq!(vec![1_000_500, 1_000_501, 1_000_502], ids);
    }

    #[test]
    fn spread_review_ids_clash_at_the_end_of_a_second_stays_in_that_second() {
        // Arrange

        let mut rows = [row(1_000_999, 3, 0, REVIEW_KIND)];

        // Act

        spread_review_ids(&mut rows, [1_000_999]);

        // Assert

        assert_eq!(1_000_000, rows[0].id);
    }

    #[test]
    fn spread_review_ids_id_already_in_anki_moves_past_it() {
        // Arrange

        let mut rows = [row(1_000_500, 3, 0, REVIEW_KIND)];

        // Act

        spread_review_ids(&mut rows, [1_000_500, 1_000_501]);

        // Assert

        assert_eq!(1_000_502, rows[0].id);
    }

    fn review(state: CardState, due_in_days: i64, local_today: NaiveDate) -> CardReview {
        let due = chrono::Local
            .from_local_datetime(&local_today.and_hms_opt(12, 0, 0).unwrap())
            .unwrap()
            + Duration::days(due_in_days);
        CardReview {
            card_id: Uuid::new_v4(),
            due: due.with_timezone(&Utc),
            stability: 5.0,
            difficulty: 5.0,
            reps: 3,
            lapses: 1,
            state,
            last_reviewed: None,
            scheduled_days: 5,
            learning_steps: 0,
        }
    }

    #[test]
    fn apply_to_due_day_before_the_last_review_keeps_amber_schedule() {
        // Arrange

        let local_today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let mut review = review(CardState::Review, 7, local_today);
        review.last_reviewed = Some(Utc::now());
        let expected = review.clone();
        let next = AnkiNextReview {
            due: start_of_day_utc(local_date(Utc::now()) - Duration::days(6)),
            scheduled_days: Some(1),
        };

        // Act

        next.apply_to(&mut review);

        // Assert

        assert_eq!(expected, review);
    }

    #[test]
    fn apply_to_due_day_after_the_last_review_takes_anki_schedule() {
        // Arrange

        let local_today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let mut review = review(CardState::Review, 7, local_today);
        review.last_reviewed = Some(Utc::now());
        let due = start_of_day_utc(local_date(Utc::now()) + Duration::days(2));
        let next = AnkiNextReview {
            due,
            scheduled_days: Some(2),
        };

        // Act

        next.apply_to(&mut review);

        // Assert

        assert_eq!((due, 2), (review.due, review.scheduled_days));
    }

    #[test]
    fn anki_schedule_review_card_due_in_its_days() {
        // Arrange

        let local_today = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let review = review(CardState::Review, 5, local_today);

        // Act

        let schedule = anki_schedule(&review, local_today);

        // Assert

        let expected = AnkiSchedule {
            due_in_days: 5,
            values: Some(AnkiCardValues {
                interval_days: Some(5),
                reps: 3,
                lapses: 1,
            }),
        };
        assert_eq!(expected, schedule);
    }

    #[test]
    fn anki_schedule_overdue_card_due_today() {
        // Arrange

        let local_today = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let review = review(CardState::Learning, -2, local_today);

        // Act

        let schedule = anki_schedule(&review, local_today);

        // Assert

        assert_eq!(0, schedule.due_in_days);
    }

    #[test]
    fn anki_schedule_new_card_sets_only_its_due_day() {
        // Arrange

        let local_today = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let review = review(CardState::New, 4, local_today);

        // Act

        let schedule = anki_schedule(&review, local_today);

        // Assert

        let expected = AnkiSchedule {
            due_in_days: 4,
            values: None,
        };
        assert_eq!(expected, schedule);
    }
}
