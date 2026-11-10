use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::anki_connect::{AnkiReview, AnkiReviewRow};
use super::entities::synced_schedule::SyncedSchedule;
use super::reviews::{
    AnkiNextReview, ReviewMerge, answers_in_anki, is_reschedule, is_review, merge_reviews,
};
use super::schedules::{
    AnkiCardSchedule, AnkiToday, ScheduleSource, amber_due_day, schedule_to_take,
};
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;

/// What both apps hold of one paired card.
pub struct CardSides<'a> {
    pub amber_logs: &'a [CardReviewLog],
    pub anki_reviews: &'a [AnkiReview],
    pub amber_review: Option<&'a CardReview>,
    /// When Amber's due date was last moved without a review.
    pub amber_due_moved_at: Option<DateTime<Utc>>,
    /// None for a card a filtered deck borrowed.
    pub anki_schedule: Option<&'a AnkiCardSchedule>,
    /// Both apps' due days at the last sync.
    pub synced: Option<&'a SyncedSchedule>,
}

/// What a sync does with one paired card, decided alike by the preview and the sync.
#[derive(Debug, PartialEq)]
pub struct CardDecision {
    /// The reviews each side lacks; `pushed` leaves out the one Anki answers.
    pub merge: ReviewMerge,
    /// Amber's newest review, which Anki answers itself rather than logs.
    pub answer: Option<AnkiReviewRow>,
    pub take_amber_schedule: bool,
    /// The due date Amber takes from Anki, after replaying any pulled reviews.
    pub anki_due: Option<AnkiNextReview>,
    /// Amber keeps its due date over the replay's, as it was moved after every review.
    pub keeps_amber_due: bool,
    /// The side whose due date, moved without a review, decides the card's.
    pub due_moved_by: Option<ScheduleSource>,
}

impl CardDecision {
    /// Amber's reviews Anki gets, answered or logged.
    pub fn reviews_to_anki(&self) -> usize {
        self.merge.pushed.len() + usize::from(self.answer.is_some())
    }
}

/// The side that reviewed last decides the due date, unless a due date was moved by hand after every review.
pub fn decide(
    card_id: Uuid,
    anki_card: AnkiCardId,
    sides: &CardSides,
    today: Option<&AnkiToday>,
) -> CardDecision {
    let mut merge = merge_reviews(card_id, anki_card, sides.amber_logs, sides.anki_reviews);
    let anki_now = sides
        .anki_schedule
        .and_then(|schedule| AnkiNextReview::from_schedule(schedule, today));
    let current = SyncedSchedule {
        amber_due: amber_due_day(sides.amber_review),
        anki_due: sides.anki_schedule.and_then(AnkiCardSchedule::due_day),
    };
    let mut decision = CardDecision {
        merge: ReviewMerge {
            pulled: Vec::new(),
            pushed: Vec::new(),
            amber_is_newer: false,
            anki_next_review: None,
        },
        answer: None,
        take_amber_schedule: false,
        anki_due: None,
        keeps_amber_due: false,
        due_moved_by: None,
    };

    let exchanges_reviews =
        !merge.pulled.is_empty() || !merge.pushed.is_empty() || merge.amber_is_newer;
    let moved_by = if exchanges_reviews {
        moved_after_every_review(sides, &current)
    } else {
        today.and_then(|today| {
            let amber_last = touched_last_in_amber(sides);
            schedule_to_take(sides.synced, &current, today, amber_last)
        })
    };
    match moved_by {
        Some(ScheduleSource::Amber) => {
            decision.take_amber_schedule = true;
            decision.keeps_amber_due = exchanges_reviews;
            decision.due_moved_by = moved_by;
        }
        Some(ScheduleSource::Anki) if anki_now.is_some() && sides.amber_review.is_some() => {
            decision.anki_due = anki_now;
            decision.due_moved_by = moved_by;
        }
        _ if exchanges_reviews => {
            let answers = sides
                .anki_schedule
                .is_some_and(|schedule| answers_in_anki(&merge, sides.amber_review, schedule));
            let newest = (0..merge.pushed.len()).max_by_key(|&i| merge.pushed[i].id);
            match newest.filter(|_| answers) {
                Some(index) => decision.answer = Some(merge.pushed.remove(index)),
                None => {
                    decision.take_amber_schedule = merge.amber_is_newer && !merge.pushed.is_empty();
                }
            }
            decision.anki_due = merge
                .anki_next_review
                .map(|next_review| anki_now.unwrap_or(next_review));
        }
        _ => {}
    }
    decision.merge = merge;
    decision
}

/// The side whose due date moved since the last sync, later than every review either app logged.
fn moved_after_every_review(sides: &CardSides, current: &SyncedSchedule) -> Option<ScheduleSource> {
    let synced = sides.synced?;
    let newest_review = sides
        .amber_logs
        .iter()
        .map(|log| log.reviewed_at.timestamp())
        .chain(
            sides
                .amber_review
                .and_then(|r| r.last_reviewed)
                .map(|t| t.timestamp()),
        )
        .chain(
            sides
                .anki_reviews
                .iter()
                .filter(|review| is_review(review))
                .map(|review| review.id.div_euclid(1000)),
        )
        .max();
    let after_reviews = |second: i64| newest_review.is_none_or(|newest| second > newest);
    let amber = sides
        .amber_due_moved_at
        .map(|moved| moved.timestamp())
        .filter(|_| synced.amber_due != current.amber_due)
        .filter(|second| after_reviews(*second));
    let anki = sides
        .anki_reviews
        .iter()
        .filter(|review| is_reschedule(review))
        .map(|review| review.id.div_euclid(1000))
        .max()
        .filter(|_| synced.anki_due != current.anki_due)
        .filter(|second| after_reviews(*second));
    match (amber, anki) {
        (Some(amber), Some(anki)) if anki > amber => Some(ScheduleSource::Anki),
        (Some(_), _) => Some(ScheduleSource::Amber),
        (None, Some(_)) => Some(ScheduleSource::Anki),
        (None, None) => None,
    }
}

/// Whether Amber's last review or due move is newer than anything Anki logged, reschedules included.
fn touched_last_in_amber(sides: &CardSides) -> bool {
    let amber = sides
        .amber_review
        .and_then(|review| review.last_reviewed)
        .max(sides.amber_due_moved_at);
    let anki = sides
        .anki_reviews
        .iter()
        .map(|review| review.id.div_euclid(1000))
        .max();
    match (amber, anki) {
        (Some(amber), Some(anki)) => amber.timestamp() > anki,
        (amber, _) => amber.is_some(),
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;
    use crate::anki_sync::anki_connect::AGAIN_EASE;
    use crate::study::value_objects::card_state::CardState;
    use crate::study::value_objects::rating::Rating;

    const ANKI_CARD: AnkiCardId = AnkiCardId(7);
    const TODAY: i64 = 100;
    /// When the last sync ran, in Unix seconds.
    const SYNCED_AT: i64 = 1_800_000_000;

    fn today() -> AnkiToday {
        AnkiToday {
            day: TODAY,
            date: NaiveDate::from_ymd_opt(2027, 1, 15).unwrap(),
        }
    }

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(second, 0).unwrap()
    }

    fn amber_log(second: i64, rating: Rating) -> CardReviewLog {
        CardReviewLog {
            id: Uuid::new_v4(),
            card_id: None,
            reviewed_at: at(second),
            rating,
            duration_ms: None,
        }
    }

    fn anki_log(second: i64, ease: i64, kind: i64) -> AnkiReview {
        AnkiReview {
            id: second * 1000,
            ease,
            time: 0,
            ivl: 3,
            kind,
        }
    }

    fn amber_review(state: CardState, due: DateTime<Utc>, last: i64) -> CardReview {
        CardReview {
            card_id: Uuid::new_v4(),
            due,
            stability: 5.0,
            difficulty: 5.0,
            reps: 2,
            lapses: 0,
            state,
            last_reviewed: Some(at(last)),
            scheduled_days: 3,
            learning_steps: 0,
        }
    }

    fn anki_schedule(kind: i64, queue: i64, due_day: i64) -> AnkiCardSchedule {
        AnkiCardSchedule {
            card_id: ANKI_CARD,
            due: due_day,
            queue,
            kind,
            interval: 3,
        }
    }

    /// Both apps due on `day` at the last sync, as Amber's local date and Anki's day number.
    fn synced(day: i64) -> SyncedSchedule {
        SyncedSchedule {
            amber_due: Some(today().date_of(day)),
            anki_due: Some(day),
        }
    }

    fn due_on(day: i64) -> DateTime<Utc> {
        crate::study::utils::day_boundary::start_of_day_utc(today().date_of(day))
    }

    #[test]
    fn decide_amber_reviewed_then_anki_moved_due_takes_anki_due() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT + 100, Rating::Good)];
        let anki_reviews = [anki_log(SYNCED_AT + 200, 0, 4)];
        let review = amber_review(CardState::Review, due_on(TODAY + 9), SYNCED_AT + 100);
        let schedule = anki_schedule(2, 2, TODAY + 20);
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(1, decision.merge.pushed.len());
        assert!(!decision.take_amber_schedule);
        assert_eq!(
            Some(due_on(TODAY + 20)),
            decision.anki_due.map(|due| due.due)
        );
        assert_eq!(Some(ScheduleSource::Anki), decision.due_moved_by);
    }

    #[test]
    fn decide_anki_reviewed_then_amber_moved_due_keeps_amber_due() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 100, 3, 1)];
        let review = amber_review(CardState::Review, due_on(TODAY + 30), SYNCED_AT - 500);
        let schedule = anki_schedule(2, 2, TODAY + 5);
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(SYNCED_AT + 200)),
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(1, decision.merge.pulled.len());
        assert!(decision.take_amber_schedule);
        assert!(decision.keeps_amber_due);
        assert_eq!(None, decision.anki_due);
        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
    }

    #[test]
    fn decide_due_moved_before_the_other_side_reviewed_follows_the_review() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 200, 3, 1)];
        let review = amber_review(CardState::Review, due_on(TODAY + 30), SYNCED_AT - 500);
        let schedule = anki_schedule(2, 2, TODAY + 5);
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(SYNCED_AT + 100)),
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert!(!decision.keeps_amber_due);
        assert_eq!(
            Some(due_on(TODAY + 5)),
            decision.anki_due.map(|due| due.due)
        );
        assert_eq!(None, decision.due_moved_by);
    }

    #[test]
    fn decide_reschedule_from_the_last_sync_not_taken_as_a_move() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Good)];
        let anki_reviews = [anki_log(SYNCED_AT - 100, 3, 1), anki_log(SYNCED_AT, 0, 4)];
        let review = amber_review(CardState::Review, due_on(TODAY + 3), SYNCED_AT - 100);
        let schedule = anki_schedule(2, 2, TODAY + 3);
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(None, decision.due_moved_by);
        assert!(!decision.take_amber_schedule);
        assert_eq!(None, decision.anki_due);
    }

    #[test]
    fn decide_new_card_good_in_amber_still_learning_answered_in_anki() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT + 100, Rating::Good)];
        let review = amber_review(CardState::Learning, at(SYNCED_AT + 700), SYNCED_AT + 100);
        let schedule = anki_schedule(0, 0, 5);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(Some(3), decision.answer.as_ref().map(|row| row.ease));
        assert!(decision.merge.pushed.is_empty());
        assert!(!decision.take_amber_schedule);
        assert_eq!(1, decision.reviews_to_anki());
    }

    #[test]
    fn decide_review_card_good_in_amber_still_learning_logged_with_amber_schedule() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT + 100, Rating::Good)];
        let review = amber_review(CardState::Learning, at(SYNCED_AT + 700), SYNCED_AT + 100);
        let schedule = anki_schedule(2, 2, TODAY);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(None, decision.answer);
        assert!(decision.take_amber_schedule);
    }

    #[test]
    fn decide_review_card_again_in_amber_answered_again_in_anki() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT + 100, Rating::Again)];
        let review = amber_review(CardState::Relearning, at(SYNCED_AT + 700), SYNCED_AT + 100);
        let schedule = anki_schedule(2, 2, TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(Some(AGAIN_EASE), decision.answer.map(|row| row.ease));
    }

    #[test]
    fn decide_suspended_card_not_answered_in_anki() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT + 100, Rating::Again)];
        let review = amber_review(CardState::Relearning, at(SYNCED_AT + 700), SYNCED_AT + 100);
        let schedule = anki_schedule(2, -1, TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(None, decision.answer);
        assert!(decision.take_amber_schedule);
    }

    #[test]
    fn decide_due_moved_in_amber_after_anki_reschedule_without_reviews_takes_amber() {
        // Arrange

        let anki_reviews = [
            anki_log(SYNCED_AT - 100, 3, 1),
            anki_log(SYNCED_AT + 100, 0, 4),
        ];
        let mut review = amber_review(CardState::Review, due_on(TODAY + 30), SYNCED_AT - 100);
        review.scheduled_days = 30;
        let schedule = anki_schedule(2, 2, TODAY + 9);
        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Good)];
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(SYNCED_AT + 200)),
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert!(decision.take_amber_schedule);
        assert!(!decision.keeps_amber_due);
        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
    }
}
