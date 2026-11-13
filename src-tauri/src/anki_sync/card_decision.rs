use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::anki_connect::AGAIN_EASE;
use super::anki_connect::{AnkiReview, AnkiReviewRow};
use super::card_timeline::{CardEvent, CardTimeline, EventKind};
use super::entities::synced_schedule::SyncedSchedule;
use super::reviews::{AnkiNextReview, ReviewMerge, answers_in_anki, merge_reviews};
use super::schedules::{
    AnkiCardSchedule, AnkiToday, ScheduleSource, amber_due_day, anki_due_date, schedule_to_take,
};
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::value_objects::card_state::CardState;

/// What both apps hold of one paired card.
pub struct CardSides<'a> {
    pub amber_logs: &'a [CardReviewLog],
    pub anki_reviews: &'a [AnkiReview],
    pub amber_review: Option<&'a CardReview>,
    /// When Amber's due date was last moved without a review.
    pub amber_due_moved_at: Option<DateTime<Utc>>,
    /// When Amber last reset the card to new.
    pub amber_reset_at: Option<DateTime<Utc>>,
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
    /// Anki holds the card as new or learning though Amber lapsed it, so it's made a review card due today
    /// before answering Again, which then relearns it with a lapse rather than restarting the new-card steps.
    pub lapse_in_anki: bool,
    /// When Anki reset the card, after anything Amber did to it: Amber resets it too, replaying only the
    /// reviews Anki made since.
    pub reset_in_amber: Option<DateTime<Utc>>,
    /// Amber reset the card after anything Anki did to it, so Anki forgets it too.
    pub forget_in_anki: bool,
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

/// Who decides the card's schedule, read from its timeline.
#[derive(Debug, PartialEq)]
enum Verdict {
    /// Anki reset the card after anything Amber did to it.
    AnkiReset(DateTime<Utc>),
    /// Amber reset the card after anything Anki did to it.
    AmberReset(DateTime<Utc>),
    /// One app moved the due date without a review, and nothing came after.
    Moved(ScheduleSource),
    /// The reviews decide: the app that reviewed last.
    Reviews,
}

/// Merges both apps' reviews and decides whose schedule the card keeps: a reset or a due move that's the newest
/// thing either app did wins, and otherwise the app that reviewed last does.
pub fn decide(
    card_id: Uuid,
    anki_card: AnkiCardId,
    sides: &CardSides,
    today: Option<&AnkiToday>,
) -> CardDecision {
    let mut merge = merge_reviews(card_id, anki_card, sides.amber_logs, sides.anki_reviews);
    let timeline = CardTimeline::of(sides);
    let anki_now = sides
        .anki_schedule
        .and_then(|schedule| AnkiNextReview::from_schedule(schedule, today));
    let exchanges_reviews =
        !merge.pulled.is_empty() || !merge.pushed.is_empty() || merge.amber_is_newer;
    let verdict = verdict(
        sides,
        &timeline,
        anki_now.as_ref(),
        today,
        exchanges_reviews,
    );
    let mut decision = CardDecision {
        merge: ReviewMerge {
            pulled: Vec::new(),
            pushed: Vec::new(),
            amber_is_newer: false,
            anki_next_review: None,
        },
        answer: None,
        lapse_in_anki: false,
        reset_in_amber: None,
        forget_in_anki: false,
        take_amber_schedule: false,
        anki_due: None,
        keeps_amber_due: false,
        due_moved_by: None,
    };
    // Whatever decides the schedule, reviews either side lacks still travel.
    match verdict {
        Verdict::AnkiReset(reset_at) => {
            // Only Anki's reviews since the reset schedule the card.
            decision.reset_in_amber = Some(reset_at);
            decision.due_moved_by = Some(ScheduleSource::Anki);
            if merge.pulled.iter().any(|log| log.reviewed_at > reset_at) {
                decision.anki_due = merge
                    .anki_next_review
                    .map(|next_review| anki_now.unwrap_or(next_review));
            }
        }
        Verdict::AmberReset(reset_at) => {
            // A due date Amber moved after its reset follows the forget.
            decision.forget_in_anki = true;
            decision.take_amber_schedule = sides
                .amber_due_moved_at
                .is_some_and(|moved| moved > reset_at);
            decision.due_moved_by = Some(ScheduleSource::Amber);
        }
        Verdict::Moved(ScheduleSource::Amber) => {
            decision.take_amber_schedule = true;
            decision.keeps_amber_due = exchanges_reviews;
            decision.due_moved_by = Some(ScheduleSource::Amber);
        }
        Verdict::Moved(ScheduleSource::Anki)
            if anki_now.is_some() && sides.amber_review.is_some() =>
        {
            decision.anki_due = anki_now;
            decision.due_moved_by = Some(ScheduleSource::Anki);
        }
        _ if exchanges_reviews => {
            let answers = sides
                .anki_schedule
                .is_some_and(|schedule| answers_in_anki(&merge, sides.amber_review, schedule));
            let newest = (0..merge.pushed.len()).max_by_key(|&i| merge.pushed[i].id);
            match newest.filter(|_| answers) {
                Some(index) => {
                    let answer = merge.pushed.remove(index);
                    decision.lapse_in_anki = lapses_in_anki(sides, &answer);
                    decision.answer = Some(answer);
                }
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

fn verdict(
    sides: &CardSides,
    timeline: &CardTimeline,
    anki_now: Option<&AnkiNextReview>,
    today: Option<&AnkiToday>,
    exchanges_reviews: bool,
) -> Verdict {
    if let Some(reset_at) = anki_reset_last(sides, timeline) {
        return Verdict::AnkiReset(reset_at);
    }
    if let Some(reset_at) = amber_reset_last(sides, timeline) {
        return Verdict::AmberReset(reset_at);
    }
    let current = SyncedSchedule {
        amber_due: amber_due_day(sides.amber_review),
        anki_due: sides.anki_schedule.and_then(AnkiCardSchedule::due_day),
    };
    let moved = if exchanges_reviews {
        moved_after_every_review(sides, timeline, &current)
    } else if current.amber_due.is_some() && current.anki_due.is_some() {
        // Both hold the card by the day: the app whose day changed since the last sync moved it.
        today.and_then(|today| {
            let amber_last = timeline.last_touch(ScheduleSource::Amber);
            let anki_last = timeline.last_touch(ScheduleSource::Anki);
            let amber_touched_last = match (amber_last, anki_last) {
                (Some(amber), Some(anki)) => amber > anki,
                (amber, _) => amber.is_some(),
            };
            schedule_to_take(sides.synced, &current, today, amber_touched_last)
        })
    } else {
        moved_without_a_due_day(sides, timeline, anki_now, today)
            .or_else(|| scheduled_only_in_amber(sides, timeline).then_some(ScheduleSource::Amber))
    };
    moved.map_or(Verdict::Reviews, Verdict::Moved)
}

/// The app whose due date moved since the last sync, later than every review either app logged. On a card's
/// first sync, any move after every review counts, such as a due date set in Anki before the import.
fn moved_after_every_review(
    sides: &CardSides,
    timeline: &CardTimeline,
    current: &SyncedSchedule,
) -> Option<ScheduleSource> {
    let newest_review = timeline.last_review();
    let after_reviews = |second: i64| newest_review.is_none_or(|newest| second > newest);
    let moved_since = |source, kind: fn(EventKind) -> bool, moved: bool| {
        timeline
            .latest(source, kind)
            .map(CardEvent::second)
            .filter(|second| moved && after_reviews(*second))
    };
    let amber = moved_since(
        ScheduleSource::Amber,
        |kind| kind == EventKind::DueMove,
        sides
            .synced
            .is_none_or(|synced| synced.amber_due != current.amber_due),
    );
    let anki = moved_since(
        ScheduleSource::Anki,
        |kind| matches!(kind, EventKind::DueMove | EventKind::Reset),
        sides
            .synced
            .is_none_or(|synced| synced.anki_due != current.anki_due),
    );
    match (amber, anki) {
        (Some(amber), Some(anki)) if anki > amber => Some(ScheduleSource::Anki),
        (Some(_), _) => Some(ScheduleSource::Amber),
        (None, Some(_)) => Some(ScheduleSource::Anki),
        (None, None) => None,
    }
}

/// A card one app doesn't hold by the day (new, or (re)learning by the minute) has no due day to compare, so
/// a due move that's the newest thing either app did carries over. Amber keeps a new card new when it takes
/// Anki's day, while Anki's "Set due date" makes it a review card.
fn moved_without_a_due_day(
    sides: &CardSides,
    timeline: &CardTimeline,
    anki_now: Option<&AnkiNextReview>,
    today: Option<&AnkiToday>,
) -> Option<ScheduleSource> {
    let review = sides.amber_review?;
    let schedule = sides.anki_schedule?;
    // Both in Anki's days; Anki can't hold a day before today, so a card overdue in Amber is due today there.
    let day = |due: DateTime<Utc>| {
        let date = anki_due_date(due);
        today.map_or(date, |today| date.max(today.date))
    };
    // None for a card Anki holds as new, which has no due date.
    let anki_day = anki_now
        .filter(|_| !schedule.is_new())
        .map(|next| day(next.due));
    if anki_day == Some(day(review.due)) {
        return None;
    }
    match timeline.moved_last()? {
        ScheduleSource::Anki if anki_day.is_none() => None,
        source => Some(source),
    }
}

/// When Amber reset the card, later than anything either app logged for it, while Anki still holds it as
/// scheduled. A card a filtered deck borrowed waits until it's back.
fn amber_reset_last(sides: &CardSides, timeline: &CardTimeline) -> Option<DateTime<Utc>> {
    sides
        .amber_review
        .filter(|review| review.state == CardState::New)?;
    let reset_at = sides.amber_reset_at?;
    let anki_scheduled = sides
        .anki_schedule
        .is_some_and(|schedule| !schedule.is_new());
    let reviewed_since = timeline
        .latest(ScheduleSource::Amber, |kind| kind == EventKind::Review)
        .is_some_and(|review| review.second() > reset_at.timestamp());
    let after_anki = timeline
        .last_touch(ScheduleSource::Anki)
        .is_none_or(|anki| anki < reset_at.timestamp());
    (anki_scheduled && !reviewed_since && after_anki).then_some(reset_at)
}

/// When Anki reset the card, later than anything Amber did to it, with nothing but reviews in Anki since (or
/// nothing at all, the card still new). Applying it clears Amber's due move, so it's taken once.
fn anki_reset_last(sides: &CardSides, timeline: &CardTimeline) -> Option<DateTime<Utc>> {
    // A card Amber holds as new has nothing to reset but a due date moved since its own last reset.
    let amber_moved_last = timeline
        .latest(ScheduleSource::Amber, |_| true)
        .is_some_and(|event| event.kind == EventKind::DueMove);
    sides
        .amber_review
        .filter(|review| review.state != CardState::New || amber_moved_last)?;
    let reset = timeline.latest(ScheduleSource::Anki, |kind| kind == EventKind::Reset)?;
    let mut since = timeline
        .of_source(ScheduleSource::Anki)
        .filter(|event| event.at_ms > reset.at_ms)
        .peekable();
    let anki_new = sides.anki_schedule.is_some_and(AnkiCardSchedule::is_new);
    let only_reviewed_since = match since.peek() {
        None => anki_new,
        Some(_) => !anki_new && since.all(|event| event.kind == EventKind::Review),
    };
    let after_amber = timeline
        .last_touch(ScheduleSource::Amber)
        .is_none_or(|amber| reset.second() > amber);
    let reset_at = DateTime::from_timestamp(reset.second(), 0)?;
    (only_reviewed_since && after_amber).then_some(reset_at)
}

/// Anki holds the card as new though Amber scheduled it, with nothing logged in Anki since: a schedule that
/// never reached Anki or was undone there, while its reviews did. A reset in Anki logs an entry, so it's kept.
fn scheduled_only_in_amber(sides: &CardSides, timeline: &CardTimeline) -> bool {
    // A new or unreviewed card has no schedule to send, whatever its due date.
    let reviewed = sides
        .amber_review
        .is_some_and(|review| review.state != CardState::New && review.last_reviewed.is_some());
    let Some(amber_last) = timeline
        .last_touch(ScheduleSource::Amber)
        .filter(|_| reviewed)
    else {
        return false;
    };
    let anki_reviewed = timeline
        .latest(ScheduleSource::Anki, |kind| kind == EventKind::Review)
        .is_some();
    sides.anki_schedule.is_some_and(AnkiCardSchedule::is_new)
        && anki_reviewed
        && timeline
            .last_touch(ScheduleSource::Anki)
            .is_some_and(|anki| anki <= amber_last)
}

/// Amber's Again lapsed a graduated card that Anki still holds as new or learning, as its earlier reviews
/// reached Anki only as log entries.
fn lapses_in_anki(sides: &CardSides, answer: &AnkiReviewRow) -> bool {
    answer.ease == AGAIN_EASE
        && sides
            .amber_review
            .is_some_and(|review| review.state == CardState::Relearning)
        && sides
            .anki_schedule
            .is_some_and(|schedule| !schedule.has_graduated())
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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
    fn decide_first_sync_anki_due_set_after_its_reviews_takes_anki_due() {
        // Arrange

        let anki_reviews = [
            anki_log(SYNCED_AT + 100, 3, 1),
            AnkiReview {
                ivl: 26,
                ..anki_log(SYNCED_AT + 200, 0, 4)
            },
        ];
        let review = CardReview {
            last_reviewed: None,
            ..amber_review(CardState::New, due_on(TODAY + 1), SYNCED_AT)
        };
        let schedule = anki_schedule(2, 2, TODAY + 20);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(1, decision.merge.pulled.len());
        assert!(!decision.take_amber_schedule);
        assert_eq!(
            Some(due_on(TODAY + 20)),
            decision.anki_due.map(|due| due.due)
        );
        assert_eq!(Some(ScheduleSource::Anki), decision.due_moved_by);
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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

    /// Card 7 new in Anki, whose log holds Amber's Good review, plus `anki_reviews`.
    fn decide_new_in_anki_reviewed_in_amber(extra_anki_reviews: &[AnkiReview]) -> CardDecision {
        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Good)];
        let mut anki_reviews = vec![anki_log(SYNCED_AT - 100, 3, 0)];
        anki_reviews.extend_from_slice(extra_anki_reviews);
        let review = amber_review(CardState::Review, due_on(TODAY + 9), SYNCED_AT - 100);
        let schedule = anki_schedule(0, 0, 5);
        let synced = synced(TODAY + 9);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };
        // No today: Anki finds it from a card due by the day, and a new card isn't one.
        decide(Uuid::new_v4(), ANKI_CARD, &sides, None)
    }

    #[test]
    fn decide_card_new_in_anki_holding_amber_review_takes_amber_schedule() {
        // Arrange

        let anki_reviews = [];

        // Act

        let decision = decide_new_in_anki_reviewed_in_amber(&anki_reviews);

        // Assert

        assert!(decision.merge.pushed.is_empty());
        assert!(decision.take_amber_schedule);
        assert!(!decision.keeps_amber_due);
        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
    }

    #[test]
    fn decide_card_reset_in_anki_after_amber_review_resets_amber() {
        // Arrange

        let anki_reviews = [AnkiReview {
            ivl: 0,
            ..anki_log(SYNCED_AT + 100, 0, 4)
        }];

        // Act

        let decision = decide_new_in_anki_reviewed_in_amber(&anki_reviews);

        // Assert

        assert!(decision.reset_in_amber.is_some());
        assert!(!decision.take_amber_schedule);
        assert_eq!(Some(ScheduleSource::Anki), decision.due_moved_by);
    }

    #[test]
    fn decide_card_reset_then_reviewed_in_anki_resets_amber_and_takes_anki_due() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Good)];
        let anki_reviews = [
            anki_log(SYNCED_AT - 100, 3, 1),
            AnkiReview {
                ivl: 0,
                ..anki_log(SYNCED_AT + 100, 0, 4)
            },
            AnkiReview {
                ivl: -600,
                ..anki_log(SYNCED_AT + 200, 3, 0)
            },
        ];
        let review = amber_review(CardState::Review, due_on(TODAY + 9), SYNCED_AT - 100);
        let schedule = AnkiCardSchedule {
            due: SYNCED_AT + 800,
            ..anki_schedule(1, 1, 0)
        };
        let synced = synced(TODAY + 9);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()));

        // Assert

        assert_eq!(Some(at(SYNCED_AT + 100)), decision.reset_in_amber);
        assert_eq!(1, decision.merge.pulled.len());
        assert_eq!(
            Some(at(SYNCED_AT + 800)),
            decision.anki_due.map(|due| due.due)
        );
        assert!(!decision.take_amber_schedule);
    }

    #[test]
    fn decide_card_reset_then_rescheduled_in_anki_not_a_reset() {
        // Arrange

        let anki_reviews = [
            AnkiReview {
                ivl: 0,
                ..anki_log(SYNCED_AT + 100, 0, 4)
            },
            anki_log(SYNCED_AT + 200, 0, 4),
        ];

        // Act

        let decision = decide_new_in_anki_reviewed_in_amber(&anki_reviews);

        // Assert

        assert!(decision.reset_in_amber.is_none());
    }

    #[test]
    fn decide_card_reset_in_anki_before_amber_review_takes_amber_schedule() {
        // Arrange

        let anki_reviews = [AnkiReview {
            ivl: 0,
            ..anki_log(SYNCED_AT - 200, 0, 4)
        }];

        // Act

        let decision = decide_new_in_anki_reviewed_in_amber(&anki_reviews);

        // Assert

        assert!(decision.reset_in_amber.is_none());
        assert!(decision.take_amber_schedule);
    }

    #[test]
    fn decide_card_due_set_in_anki_after_amber_review_not_a_reset() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 100, 0, 4)];

        // Act

        let decision = decide_new_in_anki_reviewed_in_amber(&anki_reviews);

        // Assert

        assert!(decision.reset_in_amber.is_none());
        assert_eq!(None, decision.due_moved_by);
    }

    /// Card 7, reviewed Good then Again in Amber since the last sync and left relearning, as `schedule` holds it.
    fn decide_lapsed_in_amber(schedule: AnkiCardSchedule) -> CardDecision {
        let amber_logs = [
            amber_log(SYNCED_AT + 100, Rating::Good),
            amber_log(SYNCED_AT + 200, Rating::Again),
        ];
        let review = amber_review(CardState::Relearning, at(SYNCED_AT + 800), SYNCED_AT + 200);
        let synced = synced(TODAY + 3);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };
        decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()))
    }

    #[test]
    fn decide_card_lapsed_in_amber_while_new_in_anki_lapses_it_in_anki() {
        // Arrange

        let schedule = anki_schedule(0, 0, 5);

        // Act

        let decision = decide_lapsed_in_amber(schedule);

        // Assert

        assert_eq!(Some(AGAIN_EASE), decision.answer.map(|row| row.ease));
        assert!(decision.lapse_in_anki);
        assert_eq!(1, decision.merge.pushed.len());
    }

    #[test]
    fn decide_card_lapsed_in_amber_while_review_in_anki_answers_without_lapsing_first() {
        // Arrange

        let schedule = anki_schedule(2, 2, TODAY + 3);

        // Act

        let decision = decide_lapsed_in_amber(schedule);

        // Assert

        assert_eq!(Some(AGAIN_EASE), decision.answer.map(|row| row.ease));
        assert!(!decision.lapse_in_anki);
    }

    #[test]
    fn decide_card_new_in_both_apps_takes_no_schedule() {
        // Arrange

        let review = CardReview {
            last_reviewed: None,
            ..amber_review(CardState::New, due_on(TODAY), SYNCED_AT)
        };
        let schedule = anki_schedule(0, 0, 5);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, None);

        // Assert

        assert!(!decision.take_amber_schedule);
        assert_eq!(None, decision.due_moved_by);
    }

    #[test]
    fn decide_card_new_in_both_apps_due_moved_in_amber_takes_amber_schedule() {
        // Arrange

        let review = CardReview {
            last_reviewed: None,
            ..amber_review(CardState::New, due_on(TODAY + 3), SYNCED_AT)
        };
        let schedule = anki_schedule(0, 0, 5);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(SYNCED_AT + 100)),
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, None);

        // Assert

        assert!(decision.take_amber_schedule);
        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
    }

    #[test]
    fn decide_learning_card_due_moved_in_amber_while_new_in_anki_takes_amber_schedule() {
        // Arrange

        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Good)];
        let anki_reviews = [anki_log(SYNCED_AT - 100, 3, 0)];
        let review = CardReview {
            scheduled_days: 0,
            ..amber_review(CardState::Learning, due_on(TODAY + 4), SYNCED_AT - 100)
        };
        let schedule = anki_schedule(0, 0, 5);
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(SYNCED_AT + 100)),
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: None,
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, None);

        // Assert

        assert!(decision.take_amber_schedule);
        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
    }

    /// Card 7 new in Amber, its due date moved at `moved_at`, which Anki forgot at `SYNCED_AT + 200`.
    fn decide_new_in_amber_forgotten_in_anki(
        moved_at: i64,
        amber_reset_at: Option<i64>,
    ) -> CardDecision {
        let anki_reviews = [AnkiReview {
            ivl: 0,
            ..anki_log(SYNCED_AT + 200, 0, 4)
        }];
        let review = CardReview {
            last_reviewed: None,
            ..amber_review(CardState::New, due_on(TODAY + 7), SYNCED_AT)
        };
        let schedule = anki_schedule(0, 0, 5);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at: Some(at(moved_at)),
            amber_reset_at: amber_reset_at.map(at),
            anki_schedule: Some(&schedule),
            synced: None,
        };
        decide(Uuid::new_v4(), ANKI_CARD, &sides, None)
    }

    #[test]
    fn decide_new_card_due_moved_in_amber_then_forgotten_in_anki_resets_amber() {
        // Arrange

        let moved_at = SYNCED_AT + 100;

        // Act

        let decision = decide_new_in_amber_forgotten_in_anki(moved_at, None);

        // Assert

        assert_eq!(Some(at(SYNCED_AT + 200)), decision.reset_in_amber);
        assert_eq!(Some(ScheduleSource::Anki), decision.due_moved_by);
    }

    #[test]
    fn decide_new_card_moved_before_its_amber_reset_then_forgotten_in_anki_not_reset_again() {
        // Arrange

        let moved_at = SYNCED_AT + 50;

        // Act

        let decision = decide_new_in_amber_forgotten_in_anki(moved_at, Some(SYNCED_AT + 100));

        // Assert

        assert_eq!(None, decision.reset_in_amber);
        assert_eq!(None, decision.due_moved_by);
    }

    #[test]
    fn decide_card_new_in_anki_without_any_anki_log_takes_no_schedule() {
        // Arrange

        let review = amber_review(CardState::Review, due_on(TODAY + 9), SYNCED_AT - 100);
        let schedule = anki_schedule(0, 0, 5);
        let synced = synced(TODAY + 9);
        let sides = CardSides {
            amber_logs: &[],
            anki_reviews: &[],
            amber_review: Some(&review),
            amber_due_moved_at: None,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };

        // Act

        let decision = decide(Uuid::new_v4(), ANKI_CARD, &sides, None);

        // Assert

        assert!(!decision.take_amber_schedule);
        assert_eq!(None, decision.due_moved_by);
    }

    /// Card 7, answered Again in both apps at `SYNCED_AT - 100` and left relearning in Amber, due 10 minutes
    /// later, with `anki_reviews` logged after that answer.
    fn decide_relearning_in_amber(
        anki_extra: &[AnkiReview],
        amber_due_moved_at: Option<DateTime<Utc>>,
        amber_due: DateTime<Utc>,
        schedule: AnkiCardSchedule,
    ) -> CardDecision {
        let amber_logs = [amber_log(SYNCED_AT - 100, Rating::Again)];
        let mut anki_reviews = vec![anki_log(SYNCED_AT - 100, AGAIN_EASE, 1)];
        anki_reviews.extend_from_slice(anki_extra);
        let review = CardReview {
            scheduled_days: 0,
            ..amber_review(CardState::Relearning, amber_due, SYNCED_AT - 100)
        };
        let synced = SyncedSchedule {
            amber_due: None,
            anki_due: None,
        };
        let sides = CardSides {
            amber_logs: &amber_logs,
            anki_reviews: &anki_reviews,
            amber_review: Some(&review),
            amber_due_moved_at,
            amber_reset_at: None,
            anki_schedule: Some(&schedule),
            synced: Some(&synced),
        };
        decide(Uuid::new_v4(), ANKI_CARD, &sides, Some(&today()))
    }

    #[test]
    fn decide_relearning_card_due_set_in_anki_takes_anki_due() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 50, 0, 4)];
        let schedule = anki_schedule(2, 2, TODAY + 6);

        // Act

        let decision =
            decide_relearning_in_amber(&anki_reviews, None, at(SYNCED_AT + 500), schedule);

        // Assert

        assert_eq!(Some(ScheduleSource::Anki), decision.due_moved_by);
        assert_eq!(
            Some(due_on(TODAY + 6)),
            decision.anki_due.map(|due| due.due)
        );
        assert!(!decision.take_amber_schedule);
    }

    #[test]
    fn decide_relearning_card_due_set_in_anki_to_amber_day_takes_nothing() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 50, 0, 4)];
        let schedule = anki_schedule(2, 2, TODAY);

        // Act

        let decision = decide_relearning_in_amber(&anki_reviews, None, due_on(TODAY), schedule);

        // Assert

        assert_eq!(None, decision.due_moved_by);
        assert_eq!(None, decision.anki_due);
    }

    #[test]
    fn decide_relearning_card_due_moved_in_amber_after_anki_set_takes_amber_due() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 50, 0, 4)];
        let schedule = anki_schedule(2, 2, TODAY + 6);

        // Act

        let decision = decide_relearning_in_amber(
            &anki_reviews,
            Some(at(SYNCED_AT + 200)),
            due_on(TODAY + 2),
            schedule,
        );

        // Assert

        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
        assert!(decision.take_amber_schedule);
    }

    #[test]
    fn decide_relearning_card_due_moved_in_amber_while_learning_in_anki_takes_amber_due() {
        // Arrange

        let schedule = AnkiCardSchedule {
            due: SYNCED_AT + 500,
            ..anki_schedule(3, 1, 0)
        };

        // Act

        let decision =
            decide_relearning_in_amber(&[], Some(at(SYNCED_AT + 200)), due_on(TODAY + 4), schedule);

        // Assert

        assert_eq!(Some(ScheduleSource::Amber), decision.due_moved_by);
        assert!(decision.take_amber_schedule);
    }

    #[test]
    fn decide_relearning_card_due_after_midnight_before_anki_rollover_takes_nothing() {
        // Arrange

        let anki_reviews = [anki_log(SYNCED_AT + 50, 0, 4)];
        let schedule = anki_schedule(2, 2, TODAY);
        // 01:10 on the calendar day after Anki's today, which still counts as that day until 4am.
        let amber_due = due_on(TODAY + 1) + chrono::Duration::minutes(70);

        // Act

        let decision = decide_relearning_in_amber(&anki_reviews, None, amber_due, schedule);

        // Assert

        assert_eq!(None, decision.due_moved_by);
        assert_eq!(None, decision.anki_due);
    }

    #[test]
    fn decide_relearning_card_reviewed_last_in_anki_takes_no_due() {
        // Arrange

        let schedule = anki_schedule(2, 2, TODAY + 6);

        // Act

        let decision = decide_relearning_in_amber(&[], None, at(SYNCED_AT + 500), schedule);

        // Assert

        assert_eq!(None, decision.due_moved_by);
        assert!(!decision.take_amber_schedule);
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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
            amber_reset_at: None,
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
