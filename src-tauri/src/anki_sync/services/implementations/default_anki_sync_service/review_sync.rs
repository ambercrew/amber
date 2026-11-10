use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::DefaultAnkiSyncService;
use super::{FILTERED_CARDS_QUERY, SUSPENDED_CARDS_QUERY};
use crate::anki_sync::anki_connect::{
    AnkiReview, AnkiReviewRow, anki_today, answer_cards, card_schedules, insert_reviews,
    reviews_of_cards, set_cards_values, set_due_date, suspend_cards,
};
use crate::anki_sync::card_decision::{CardDecision, CardSides, decide};
use crate::anki_sync::entities::anki_card_pair::AnkiCardPair;
use crate::anki_sync::entities::synced_schedule::SyncedSchedule;
use crate::anki_sync::events::replay_card_reviews_event::{CardHistoryDto, HistoryReviewDto};
use crate::anki_sync::reviews::{
    AnkiNextReview, anki_counts, anki_schedule, match_answered_reviews, spread_review_ids,
};
use crate::anki_sync::schedules::{
    AnkiCardSchedule, AnkiToday, ScheduleSource, amber_due_day, anki_date,
};
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::anki_sync::services::sync_frontend::AnkiSyncStage;
use crate::elements::value_objects::element_id::ElementId;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::events::element_due_changed_event::emit_element_due_changed;

/// Each card's review log, by card.
type CardHistories = HashMap<Uuid, Vec<CardReviewLog>>;
/// Each paired card's place in Anki's schedule, leaving out cards a filtered deck borrowed.
type AnkiSchedules = HashMap<AnkiCardId, AnkiCardSchedule>;

/// Anki's reviews that Amber takes, and the schedules replayed from them.
pub(super) struct PulledReviews {
    pub(super) logs: CardHistories,
    pub(super) schedules: HashMap<Uuid, CardReview>,
    /// Due dates taken from Anki without replaying, as the card's review state they were applied to and after.
    pub(super) moved: HashMap<Uuid, (CardReview, CardReview)>,
}

/// What each side lacks of the other's reviews, worked out before either is written to.
pub(super) struct PreparedReviews {
    pub(super) pulled: PulledReviews,
    /// Amber's review logs as they were read, to spot a card reviewed meanwhile.
    pub(super) amber_histories: CardHistories,
    pub(super) pushed: Vec<AnkiReviewRow>,
    /// Cards Amber reviewed or rescheduled last, whose schedule Anki takes.
    pub(super) take_amber_schedule: Vec<AnkiCardPair>,
    /// Amber's newest review of each card still (re)learning in Amber, which Anki answers itself.
    pub(super) answer_in_anki: Vec<(AnkiCardPair, AnkiReviewRow)>,
    /// Cards that get Amber's reviews but keep Anki's schedule, whose review counts Anki takes from Amber.
    pub(super) take_amber_counts: Vec<AnkiCardPair>,
    /// Each pair's due days at the last sync.
    pub(super) synced: HashMap<AnkiCardId, SyncedSchedule>,
    pub(super) counts: ReviewCounts,
}

/// How many reviews a sync copies each way, and how many due dates moved without a review it carries over.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(super) struct ReviewCounts {
    pub(super) to_anki: usize,
    pub(super) to_amber: usize,
    pub(super) due_dates_to_anki: usize,
    pub(super) due_dates_to_amber: usize,
}

impl ReviewCounts {
    fn add(&mut self, decision: &CardDecision) {
        self.to_anki += decision.reviews_to_anki();
        self.to_amber += decision.merge.pulled.len();
        match decision.due_moved_by {
            Some(ScheduleSource::Amber) => self.due_dates_to_anki += 1,
            Some(ScheduleSource::Anki) => self.due_dates_to_amber += 1,
            None => {}
        }
    }
}

/// What `push_reviews` gives Anki.
pub(super) struct AmberReviewsForAnki<'a> {
    pub(super) take_amber_schedule: &'a [AnkiCardPair],
    pub(super) take_amber_counts: &'a [AnkiCardPair],
    pub(super) replayed: &'a HashMap<Uuid, CardReview>,
    pub(super) pushed: Vec<AnkiReviewRow>,
    pub(super) answer_in_anki: Vec<(AnkiCardPair, AnkiReviewRow)>,
}

/// Both apps' review state, read once to decide every card.
struct ReviewInputs {
    anki_reviews: HashMap<AnkiCardId, Vec<AnkiReview>>,
    /// Ids Anki holds, before answered reviews take the second of Amber's.
    taken_ids: Vec<i64>,
    anki_schedules: AnkiSchedules,
    today: Option<AnkiToday>,
    synced: HashMap<AnkiCardId, SyncedSchedule>,
    amber_histories: CardHistories,
    amber_reviews: HashMap<Uuid, CardReview>,
    due_moved: HashMap<Uuid, DateTime<Utc>>,
}

impl ReviewInputs {
    fn sides(&self, card_id: Uuid, anki_card: Option<AnkiCardId>) -> CardSides<'_> {
        let anki = |card: AnkiCardId| self.anki_reviews.get(&card);
        CardSides {
            amber_logs: self
                .amber_histories
                .get(&card_id)
                .map_or(&[][..], Vec::as_slice),
            anki_reviews: anki_card.and_then(anki).map_or(&[][..], Vec::as_slice),
            amber_review: self.amber_reviews.get(&card_id),
            amber_due_moved_at: self.due_moved.get(&card_id).copied(),
            anki_schedule: anki_card.and_then(|card| self.anki_schedules.get(&card)),
            synced: anki_card.and_then(|card| self.synced.get(&card)),
        }
    }

    fn decide(&self, card_id: Uuid, anki_card: Option<AnkiCardId>) -> CardDecision {
        let sides = self.sides(card_id, anki_card);
        let anki_card = anki_card.unwrap_or(AnkiCardId(0));
        decide(card_id, anki_card, &sides, self.today.as_ref())
    }
}

impl DefaultAnkiSyncService {
    /// Counts what `prepare_reviews` would copy for `cards`, each with its Anki card, or none for one Anki
    /// doesn't hold yet, whose whole history goes. Leaves out the cards a deck import brings.
    pub(super) async fn count_reviews(
        &self,
        profile: &str,
        cards: &[(Uuid, Option<AnkiCardId>)],
    ) -> Result<ReviewCounts, AnkiSyncError> {
        let anki_ids: Vec<_> = cards.iter().filter_map(|(_, anki)| *anki).collect();
        let inputs = self.review_inputs(profile, &anki_ids).await?;
        let mut counts = ReviewCounts::default();
        for (card_id, anki_card) in cards {
            counts.add(&inputs.decide(*card_id, *anki_card));
        }
        Ok(counts)
    }

    async fn review_inputs(
        &self,
        profile: &str,
        anki_ids: &[AnkiCardId],
    ) -> Result<ReviewInputs, AnkiSyncError> {
        let mut anki_reviews = reviews_of_cards(self.client(), anki_ids).await?;
        let taken_ids = anki_reviews.values().flatten().map(|r| r.id).collect();
        self.match_answered(&mut anki_reviews).await?;
        let anki_schedules = self.anki_schedules(anki_ids).await?;
        let today = self.anki_today(&anki_schedules).await?;
        Ok(ReviewInputs {
            anki_reviews,
            taken_ids,
            anki_schedules,
            today,
            synced: self
                .anki_sync_repository
                .get_synced_schedules(profile)
                .await?,
            amber_histories: self.card_histories().await?,
            amber_reviews: self.amber_reviews().await?,
            due_moved: self.card_review_repository.get_due_moved_times().await?,
        })
    }

    /// Merges both sides' reviews. Amber reschedules cards that got reviews from their whole history,
    /// replayed on the frontend; the side that reviewed last decides the due date, unless one was moved
    /// without a review after every review, which then goes to the other side.
    pub(super) async fn prepare_reviews(
        &self,
        profile: &str,
        pairs: &[AnkiCardPair],
    ) -> Result<PreparedReviews, AnkiSyncError> {
        self.sync_frontend
            .report_progress(AnkiSyncStage::Reviews, 0, 0);
        let anki_ids: Vec<_> = pairs.iter().map(|pair| pair.anki_card_id).collect();
        let inputs = self.review_inputs(profile, &anki_ids).await?;

        let mut counts = ReviewCounts::default();
        let mut pulled: CardHistories = HashMap::new();
        let mut pushed = Vec::new();
        let mut histories = Vec::new();
        let mut take_amber_schedule = Vec::new();
        let mut answer_in_anki = Vec::new();
        let mut take_amber_counts = Vec::new();
        let mut anki_next_reviews = HashMap::new();
        let mut amber_dues = HashMap::new();
        let mut moved = HashMap::new();
        for pair in pairs {
            let decision = inputs.decide(pair.card_id, Some(pair.anki_card_id));
            counts.add(&decision);
            let review = inputs.amber_reviews.get(&pair.card_id);
            let merge = decision.merge;
            if decision.take_amber_schedule {
                take_amber_schedule.push(*pair);
            } else if !merge.pushed.is_empty() || decision.answer.is_some() {
                take_amber_counts.push(*pair);
            }
            if let Some(row) = decision.answer {
                answer_in_anki.push((*pair, row));
            }
            if let (true, Some(review)) = (decision.keeps_amber_due, review) {
                amber_dues.insert(pair.card_id, review.clone());
            }
            match (decision.anki_due, review) {
                (Some(due), _) if !merge.pulled.is_empty() => {
                    anki_next_reviews.insert(pair.card_id, due);
                }
                (Some(due), Some(review)) => {
                    let mut rescheduled = review.clone();
                    due.apply_to(&mut rescheduled);
                    moved.insert(pair.card_id, (review.clone(), rescheduled));
                }
                _ => {}
            }
            if !merge.pulled.is_empty() {
                let amber = inputs
                    .amber_histories
                    .get(&pair.card_id)
                    .map_or(&[][..], Vec::as_slice);
                histories.push(
                    self.replay_history(pair.card_id, amber, &merge.pulled)
                        .await?,
                );
                pulled.insert(pair.card_id, merge.pulled);
            }
            pushed.extend(merge.pushed);
        }

        spread_review_ids(&mut pushed, inputs.taken_ids);
        let schedules = self
            .replay(histories, &anki_next_reviews, &amber_dues)
            .await?;
        Ok(PreparedReviews {
            pulled: PulledReviews {
                logs: pulled,
                schedules,
                moved,
            },
            amber_histories: inputs.amber_histories,
            pushed,
            take_amber_schedule,
            answer_in_anki,
            take_amber_counts,
            synced: inputs.synced,
            counts,
        })
    }

    /// Each pair's due days as they stand after the sync, for the next one to tell which side moved them.
    /// A card a filtered deck borrowed keeps Anki's day from before.
    pub(super) async fn synced_schedules(
        &self,
        pairs: &[AnkiCardPair],
        previous: &HashMap<AnkiCardId, SyncedSchedule>,
    ) -> Result<HashMap<AnkiCardId, SyncedSchedule>, AnkiSyncError> {
        let anki_ids: Vec<_> = pairs.iter().map(|pair| pair.anki_card_id).collect();
        let anki_schedules = self.anki_schedules(&anki_ids).await?;
        let amber_reviews = self.amber_reviews().await?;
        Ok(pairs
            .iter()
            .map(|pair| {
                let anki_due = match anki_schedules.get(&pair.anki_card_id) {
                    Some(schedule) => schedule.due_day(),
                    None => previous.get(&pair.anki_card_id).and_then(|s| s.anki_due),
                };
                let schedule = SyncedSchedule {
                    amber_due: amber_due_day(amber_reviews.get(&pair.card_id)),
                    anki_due,
                };
                (pair.anki_card_id, schedule)
            })
            .collect())
    }

    async fn anki_schedules(&self, cards: &[AnkiCardId]) -> Result<AnkiSchedules, AnkiSyncError> {
        if cards.is_empty() {
            return Ok(HashMap::new());
        }
        let filtered = self.find_card_set(FILTERED_CARDS_QUERY).await?;
        Ok(card_schedules(self.client(), cards)
            .await?
            .into_iter()
            .filter(|schedule| !filtered.contains(&schedule.card_id))
            .map(|schedule| (schedule.card_id, schedule))
            .collect())
    }

    /// Only needed, and only found, when a card comes due by the day.
    async fn anki_today(
        &self,
        schedules: &AnkiSchedules,
    ) -> Result<Option<AnkiToday>, AnkiSyncError> {
        let Some(card) = schedules
            .values()
            .find(|schedule| schedule.is_searchable_by_due())
        else {
            return Ok(None);
        };
        let day = anki_today(self.client(), card).await?;
        Ok(Some(AnkiToday::new(day, Utc::now())))
    }

    async fn amber_reviews(&self) -> Result<HashMap<Uuid, CardReview>, AnkiSyncError> {
        Ok(self
            .card_review_repository
            .get_all()
            .await?
            .into_iter()
            .map(|review| (review.card_id, review))
            .collect())
    }

    /// Saves the pulled reviews and schedules, and returns what was saved. A card reviewed in Amber since
    /// `amber_histories` were read keeps that schedule; the next sync pulls and replays it again.
    pub(super) async fn save_pulled(
        &self,
        mut pulled: PulledReviews,
        amber_histories: &CardHistories,
    ) -> Result<PulledReviews, AnkiSyncError> {
        let current = self.card_histories().await?;
        pulled.logs.retain(|card_id, _| {
            log_ids(current.get(card_id)) == log_ids(amber_histories.get(card_id))
        });
        pulled
            .schedules
            .retain(|card_id, _| pulled.logs.contains_key(card_id));
        for log in pulled.logs.values().flatten() {
            self.card_review_log_repository.create(log).await?;
        }
        for review in pulled.schedules.values() {
            self.card_review_repository.upsert(review).await?;
        }
        // A card graded meanwhile keeps that schedule.
        let mut kept = HashMap::new();
        for (card_id, (read, rescheduled)) in pulled.moved {
            let current = self.card_review_repository.get_by_card_id(card_id).await?;
            if current.as_ref() == Some(&read) {
                self.card_review_repository.upsert(&rescheduled).await?;
                kept.insert(card_id, (read, rescheduled));
            }
        }
        pulled.moved = kept;
        if !pulled.schedules.is_empty() || !pulled.moved.is_empty() {
            emit_element_due_changed(&self.event_manager).await;
        }
        Ok(pulled)
    }

    /// Gives Anki Amber's schedules and reviews, returning how many reviews were sent. The schedule goes
    /// first: a card's pushed reviews are what makes the next sync retry it.
    pub(super) async fn push_reviews(
        &self,
        reviews: AmberReviewsForAnki<'_>,
    ) -> Result<usize, AnkiSyncError> {
        self.schedule_in_anki(reviews.take_amber_schedule, reviews.replayed)
            .await?;
        if !reviews.pushed.is_empty() {
            insert_reviews(self.client(), &reviews.pushed).await?;
        }
        let answered = reviews.answer_in_anki.len();
        self.answer_in_anki(reviews.answer_in_anki, reviews.replayed)
            .await?;
        // After answering, which counts one review of Anki's own.
        self.counts_in_anki(reviews.take_amber_counts, reviews.replayed)
            .await?;
        Ok(reviews.pushed.len() + answered)
    }

    /// Answers each card in Anki for Amber's review, and records which Anki review stands for it. A card
    /// Anki can't answer gets the review logged and Amber's schedule instead.
    async fn answer_in_anki(
        &self,
        cards: Vec<(AnkiCardPair, AnkiReviewRow)>,
        replayed: &HashMap<Uuid, CardReview>,
    ) -> Result<(), AnkiSyncError> {
        if cards.is_empty() {
            return Ok(());
        }
        // Anki logs the answer at its own time; a second's slack for the clocks' rounding.
        let started = Utc::now().timestamp_millis() - 1000;
        let answers: Vec<(AnkiCardId, i64)> = cards
            .iter()
            .map(|(pair, row)| (pair.anki_card_id, row.ease))
            .collect();
        let answered = answer_cards(self.client(), &answers).await?;
        let (answered, refused): (Vec<_>, Vec<_>) = cards
            .into_iter()
            .partition(|(pair, _)| answered.contains(&pair.anki_card_id));
        if !refused.is_empty() {
            let rows: Vec<AnkiReviewRow> = refused.iter().map(|(_, row)| row.clone()).collect();
            insert_reviews(self.client(), &rows).await?;
            let pairs: Vec<AnkiCardPair> = refused.iter().map(|(pair, _)| *pair).collect();
            self.schedule_in_anki(&pairs, replayed).await?;
        }
        if answered.is_empty() {
            return Ok(());
        }

        let anki_ids: Vec<AnkiCardId> =
            answered.iter().map(|(pair, _)| pair.anki_card_id).collect();
        let reviews = reviews_of_cards(self.client(), &anki_ids).await?;
        let matched: Vec<(i64, i64)> = answered
            .iter()
            .filter_map(|(pair, row)| {
                let newest = reviews
                    .get(&pair.anki_card_id)?
                    .iter()
                    .map(|review| review.id)
                    .filter(|id| *id >= started)
                    .max()?;
                Some((newest, row.id.div_euclid(1000)))
            })
            .collect();
        self.anki_sync_repository
            .save_answered_reviews(&matched)
            .await?;
        // Kept even if the sync fails later, or the next one would pull Anki's answer as a new review.
        self.commit().await?;
        Ok(())
    }

    /// Gives Anki Amber's review and lapse counts, which reviews logged in Anki don't add to.
    async fn counts_in_anki(
        &self,
        cards: &[AnkiCardPair],
        replayed: &HashMap<Uuid, CardReview>,
    ) -> Result<(), AnkiSyncError> {
        let mut values = Vec::new();
        for pair in cards {
            if let Some(review) = self.review_after_sync(pair.card_id, replayed).await? {
                values.push((pair.anki_card_id, anki_counts(&review)));
            }
        }
        if !values.is_empty() {
            set_cards_values(self.client(), &values).await?;
        }
        Ok(())
    }

    /// The card's replayed review, or the one Amber holds when nothing was replayed.
    async fn review_after_sync(
        &self,
        card_id: Uuid,
        replayed: &HashMap<Uuid, CardReview>,
    ) -> Result<Option<CardReview>, AnkiSyncError> {
        match replayed.get(&card_id) {
            Some(review) => Ok(Some(review.clone())),
            None => Ok(self.card_review_repository.get_by_card_id(card_id).await?),
        }
    }

    /// Gives Anki's answers for Amber's reviews the second of the review each stands for.
    async fn match_answered(
        &self,
        reviews: &mut HashMap<AnkiCardId, Vec<AnkiReview>>,
    ) -> Result<(), AnkiSyncError> {
        let answered = self.anki_sync_repository.get_answered_reviews().await?;
        match_answered_reviews(reviews, &answered);
        Ok(())
    }

    async fn replay_history(
        &self,
        card_id: Uuid,
        amber: &[CardReviewLog],
        pulled: &[CardReviewLog],
    ) -> Result<CardHistoryDto, AnkiSyncError> {
        let current = self
            .card_review_repository
            .get_by_card_id(card_id)
            .await?
            .filter(|current| all_newer_than_amber(pulled, amber, current.last_reviewed));
        let mut reviews: Vec<&CardReviewLog> = match current {
            Some(_) => pulled.iter().collect(),
            None => amber.iter().chain(pulled).collect(),
        };
        reviews.sort_by_key(|log| log.reviewed_at);
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(ElementId::Card(card_id)))
            .await?;
        Ok(CardHistoryDto {
            card_id,
            profile: profile.into(),
            start: current.map(Into::into),
            reviews: reviews
                .iter()
                .map(|log| HistoryReviewDto {
                    reviewed_at: log.reviewed_at,
                    rating: log.rating,
                })
                .collect(),
        })
    }

    /// Reschedules the cards on the frontend; a card Anki reviewed last then takes Anki's due date, and
    /// one in `amber_dues` keeps the due date Amber moved it to.
    async fn replay(
        &self,
        histories: Vec<CardHistoryDto>,
        anki_next_reviews: &HashMap<Uuid, AnkiNextReview>,
        amber_dues: &HashMap<Uuid, CardReview>,
    ) -> Result<HashMap<Uuid, CardReview>, AnkiSyncError> {
        if histories.is_empty() {
            return Ok(HashMap::new());
        }
        let mut replayed: HashMap<Uuid, CardReview> = self
            .sync_frontend
            .replay_reviews(histories)
            .await?
            .into_iter()
            .map(|review| (review.card_id, review))
            .collect();
        for (card_id, review) in &mut replayed {
            if let Some(next_review) = anki_next_reviews.get(card_id) {
                next_review.apply_to(review);
            }
            if let Some(amber) = amber_dues.get(card_id) {
                review.due = amber.due;
                review.scheduled_days = amber.scheduled_days;
            }
        }
        Ok(replayed)
    }

    async fn card_histories(&self) -> Result<CardHistories, AnkiSyncError> {
        let mut histories: CardHistories = HashMap::new();
        for log in self.card_review_log_repository.get_card_histories().await? {
            if let Some(card_id) = log.card_id {
                histories.entry(card_id).or_default().push(log);
            }
        }
        Ok(histories)
    }

    async fn schedule_in_anki(
        &self,
        cards: &[AnkiCardPair],
        replayed: &HashMap<Uuid, CardReview>,
    ) -> Result<(), AnkiSyncError> {
        let anki_today = anki_date(Utc::now());
        let mut schedules = Vec::new();
        for pair in cards {
            let review = self.review_after_sync(pair.card_id, replayed).await?;
            if let Some(schedule) = review.and_then(|r| anki_schedule(&r, anki_today)) {
                schedules.push((pair.anki_card_id, schedule));
            }
        }

        if schedules.is_empty() {
            return Ok(());
        }
        let suspended = self.find_card_set(SUSPENDED_CARDS_QUERY).await?;

        let mut by_due: BTreeMap<i64, Vec<_>> = BTreeMap::new();
        for (anki_card, schedule) in &schedules {
            by_due
                .entry(schedule.due_in_days)
                .or_default()
                .push(*anki_card);
        }
        for (days, cards) in by_due {
            set_due_date(self.client(), &cards, days).await?;
        }
        // Setting a due date puts a card back in Anki's queue, so one suspended there is suspended again.
        let suspended: Vec<AnkiCardId> = schedules
            .iter()
            .map(|(anki_card, _)| *anki_card)
            .filter(|anki_card| suspended.contains(anki_card))
            .collect();
        if !suspended.is_empty() {
            suspend_cards(self.client(), &suspended).await?;
        }
        // After the due dates, which set the interval to the days until due.
        let values: Vec<_> = schedules
            .iter()
            .map(|(anki_card, schedule)| (*anki_card, schedule.values))
            .collect();
        set_cards_values(self.client(), &values).await?;
        Ok(())
    }
}

/// Whether every pulled review is newer than all Amber knows of the card, so its schedule can be continued.
pub(super) fn all_newer_than_amber(
    pulled: &[CardReviewLog],
    amber: &[CardReviewLog],
    last_reviewed: Option<DateTime<Utc>>,
) -> bool {
    let newest = amber
        .iter()
        .map(|log| log.reviewed_at)
        .chain(last_reviewed)
        .max();
    newest.is_none_or(|newest| pulled.iter().all(|log| log.reviewed_at > newest))
}

fn log_ids(logs: Option<&Vec<CardReviewLog>>) -> HashSet<Uuid> {
    logs.into_iter().flatten().map(|log| log.id).collect()
}
