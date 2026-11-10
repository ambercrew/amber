use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose};
#[cfg(test)]
use mockall::automock;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use thiserror::Error;

use super::schedules::AnkiCardSchedule;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;

/// Anki renders every card `cardsInfo` asks about, so a large request blocks it for minutes.
const CARDS_INFO_BATCH: usize = 500;
/// More days than a collection can be old, bounding the search for Anki's today.
const MAX_ANKI_DAY: i64 = 100_000;
/// Notes per `notesInfo` request, so one request never holds Anki for long.
const NOTES_INFO_BATCH: usize = 500;
/// Reviews per `insertReviews` request, which Anki checks one by one against its whole log.
const INSERT_REVIEWS_BATCH: usize = 1000;
/// Every action the sync uses, so an older add-on is turned away before anything is written.
const REQUIRED_ACTIONS: [&str; 23] = [
    "answerCards",
    "cardsInfo",
    "changeDeck",
    "deleteMediaFile",
    "deleteNotes",
    "exportPackage",
    "findCards",
    "findNotes",
    "getActiveProfile",
    "getDecks",
    "getMediaDirPath",
    "getMediaFilesNames",
    "getReviewsOfCards",
    "importPackage",
    "insertReviews",
    "multi",
    "notesInfo",
    "retrieveMediaFile",
    "setDueDate",
    "setSpecificValueOfCard",
    "storeMediaFile",
    "suspend",
    "apiReflect",
];
/// AnkiConnect's answer to an action it doesn't have.
const UNSUPPORTED_ACTION: &str = "unsupported action";
/// Actions per `multi` request, so one request never holds Anki for long.
const MULTI_BATCH: usize = 500;
/// Anki's ease for Again.
pub const AGAIN_EASE: i64 = 1;
/// Makes each action inside `multi` answer with its own `result` and `error`.
const MULTI_ACTION_VERSION: u8 = 6;
/// Rounds a clashing review is moved to another millisecond before its error stands.
const REVIEW_ID_ATTEMPTS: usize = 32;
/// How AnkiConnect refuses a review whose id its log holds, in its own check and in SQLite's.
const REVIEW_ID_CLASHES: [&str; 2] = [
    "Review ID already exists",
    "UNIQUE constraint failed: revlog.id",
];

#[derive(Debug, Error)]
pub enum AnkiConnectError {
    #[error(
        "Couldn't reach Anki. Open Anki with the AnkiConnect add-on (code 2055492159) installed, then sync again."
    )]
    Unreachable,
    #[error("Anki refused the sync: {0}")]
    Refused(String),
    #[error("Anki sent an unexpected answer")]
    InvalidResponse,
    #[error(
        "Your AnkiConnect add-on is too old for syncing. Update it in Anki (Tools > Add-ons > Check for Updates), restart Anki, then sync again."
    )]
    Outdated,
}

/// The AnkiConnect add-on's local API: one action per call.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait AnkiConnectClient: Send + Sync {
    async fn invoke(&self, action: &'static str, params: Value) -> Result<Value, AnkiConnectError>;
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiNoteInfo {
    pub note_id: AnkiNoteId,
    pub fields: HashMap<String, AnkiFieldValue>,
    pub cards: Vec<AnkiCardId>,
    #[serde(default)]
    pub model_name: String,
    /// When the note last changed, in Unix seconds; an import keeps the time the package gave it.
    #[serde(default, rename = "mod")]
    pub modified: i64,
}

impl AnkiNoteInfo {
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields.get(name).map(|field| field.value.as_str())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnkiCardInfo {
    pub card_id: AnkiCardId,
    pub note: AnkiNoteId,
    pub ord: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnkiFieldValue {
    pub value: String,
}

/// One action's answer inside a `multi` request.
#[derive(Deserialize)]
struct MultiResult {
    #[serde(default)]
    result: Value,
    error: Option<String>,
}

/// One row of Anki's review log; `id` is the review time in milliseconds.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AnkiReview {
    pub id: i64,
    pub ease: i64,
    pub time: i64,
    /// The interval Anki chose: days, or seconds when negative.
    pub ivl: i64,
    #[serde(rename = "type")]
    pub kind: i64,
}

/// A review Anki lacks, as a row of its review log; the interval and ease factor are left for Anki.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnkiReviewRow {
    /// The review time in milliseconds, which must be unique across Anki's whole log.
    pub id: i64,
    pub card_id: AnkiCardId,
    pub ease: i64,
    pub time_ms: i64,
    pub kind: i64,
}

impl AnkiReviewRow {
    /// `[id, card id, usn, ease, interval, last interval, factor, time, type]`, as `insertReviews` takes it.
    fn to_log_row(&self) -> [i64; 9] {
        let unsynced = -1;
        [
            self.id,
            self.card_id.0,
            unsynced,
            self.ease,
            0,
            0,
            0,
            self.time_ms,
            self.kind,
        ]
    }
}

/// The card values Amber sets in Anki beyond its due date; the interval only with a schedule.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnkiCardValues {
    pub interval_days: Option<i64>,
    pub reps: i64,
    pub lapses: i64,
}

impl AnkiCardValues {
    fn keys_and_values(&self) -> (Vec<&'static str>, Vec<i64>) {
        let mut keys = vec!["reps", "lapses"];
        let mut values = vec![self.reps, self.lapses];
        if let Some(interval) = self.interval_days {
            keys.insert(0, "ivl");
            values.insert(0, interval);
        }
        (keys, values)
    }
}

async fn call<T: DeserializeOwned>(
    client: &dyn AnkiConnectClient,
    action: &'static str,
    params: Value,
) -> Result<T, AnkiConnectError> {
    let result = client.invoke(action, params).await?;
    serde_json::from_value(result).map_err(|_| AnkiConnectError::InvalidResponse)
}

pub async fn import_package(
    client: &dyn AnkiConnectClient,
    path: &str,
) -> Result<(), AnkiConnectError> {
    let imported: bool = call(client, "importPackage", json!({ "path": path })).await?;
    imported
        .then_some(())
        .ok_or_else(|| AnkiConnectError::Refused("no collection is open".to_string()))
}

/// Writes `deck` and its subdecks to a package at `path`, without their scheduling.
pub async fn export_package(
    client: &dyn AnkiConnectClient,
    deck: &str,
    path: &str,
) -> Result<(), AnkiConnectError> {
    let params = json!({ "deck": deck, "path": path, "includeSched": false });
    let exported: bool = call(client, "exportPackage", params).await?;
    exported
        .then_some(())
        .ok_or_else(|| AnkiConnectError::Refused(format!("couldn't export the deck {deck}")))
}

/// The cards by the deck each is in.
pub async fn decks_of_cards(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
) -> Result<HashMap<String, Vec<AnkiCardId>>, AnkiConnectError> {
    call(client, "getDecks", json!({ "cards": cards })).await
}

/// The open profile; each one is a separate collection. Fails when the add-on lacks an action the sync uses.
pub async fn active_profile(client: &dyn AnkiConnectClient) -> Result<String, AnkiConnectError> {
    require_actions(client).await?;
    let profile: Option<String> = call(client, "getActiveProfile", json!({})).await?;
    profile.ok_or_else(|| AnkiConnectError::Refused("no profile is open".to_string()))
}

/// Older add-ons lack `apiReflect` itself, which also means they're too old.
async fn require_actions(client: &dyn AnkiConnectClient) -> Result<(), AnkiConnectError> {
    let params = json!({ "scopes": ["actions"], "actions": REQUIRED_ACTIONS });
    let reflected = match client.invoke("apiReflect", params).await {
        Err(AnkiConnectError::Refused(error)) if error == UNSUPPORTED_ACTION => {
            return Err(AnkiConnectError::Outdated);
        }
        other => other?,
    };
    let supported: HashSet<String> = serde_json::from_value(reflected["actions"].clone())
        .map_err(|_| AnkiConnectError::InvalidResponse)?;
    if REQUIRED_ACTIONS
        .iter()
        .all(|action| supported.contains(*action))
    {
        Ok(())
    } else {
        Err(AnkiConnectError::Outdated)
    }
}

pub async fn suspend_cards(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
) -> Result<(), AnkiConnectError> {
    client.invoke("suspend", json!({ "cards": cards })).await?;
    Ok(())
}

pub async fn find_notes(
    client: &dyn AnkiConnectClient,
    query: &str,
) -> Result<Vec<AnkiNoteId>, AnkiConnectError> {
    call(client, "findNotes", json!({ "query": query })).await
}

pub async fn find_cards(
    client: &dyn AnkiConnectClient,
    query: &str,
) -> Result<Vec<AnkiCardId>, AnkiConnectError> {
    call(client, "findCards", json!({ "query": query })).await
}

pub async fn notes_info(
    client: &dyn AnkiConnectClient,
    notes: &[AnkiNoteId],
) -> Result<Vec<AnkiNoteInfo>, AnkiConnectError> {
    let mut infos = Vec::with_capacity(notes.len());
    for batch in notes.chunks(NOTES_INFO_BATCH) {
        let batch: Vec<AnkiNoteInfo> = call(client, "notesInfo", json!({ "notes": batch })).await?;
        infos.extend(batch);
    }
    Ok(infos)
}

/// Leaves out the cards Anki no longer has, which AnkiConnect answers with an empty object.
pub async fn cards_info(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
) -> Result<Vec<AnkiCardInfo>, AnkiConnectError> {
    let mut infos = Vec::with_capacity(cards.len());
    for batch in cards.chunks(CARDS_INFO_BATCH) {
        let batch: Vec<Value> = call(client, "cardsInfo", json!({ "cards": batch })).await?;
        for info in batch {
            if info.as_object().is_none_or(|fields| !fields.is_empty()) {
                let info = serde_json::from_value(info);
                infos.push(info.map_err(|_| AnkiConnectError::InvalidResponse)?);
            }
        }
    }
    Ok(infos)
}

/// Each card's place in Anki's schedule, leaving out the cards Anki no longer has.
pub async fn card_schedules(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
) -> Result<Vec<AnkiCardSchedule>, AnkiConnectError> {
    let fields = ["cardId", "due", "queue", "type", "interval"];
    let mut schedules = Vec::with_capacity(cards.len());
    for batch in cards.chunks(CARDS_INFO_BATCH) {
        let params = json!({ "cards": batch, "fields": fields });
        let batch: Vec<Value> = call(client, "cardsInfo", params).await?;
        for info in batch {
            if info.as_object().is_none_or(|fields| !fields.is_empty()) {
                let schedule = serde_json::from_value(info);
                schedules.push(schedule.map_err(|_| AnkiConnectError::InvalidResponse)?);
            }
        }
    }
    Ok(schedules)
}

/// Anki's day number for today, which AnkiConnect doesn't report: `prop:due` searches count days from it,
/// so a binary search over one card that comes due by the day finds how far off its due day is.
pub async fn anki_today(
    client: &dyn AnkiConnectClient,
    card: &AnkiCardSchedule,
) -> Result<i64, AnkiConnectError> {
    // Days from today to the card's due day; today is a day count since the collection was made.
    let (mut low, mut high) = (card.due - MAX_ANKI_DAY, card.due);
    while low < high {
        let middle = low + (high - low + 1) / 2;
        let query = format!("cid:{} prop:due>={middle}", card.card_id.0);
        if find_cards(client, &query).await?.is_empty() {
            high = middle - 1;
        } else {
            low = middle;
        }
    }
    Ok(card.due - low)
}

/// The bytes of a file in Anki's media folder, or `None` when it has none by that name.
pub async fn retrieve_media_file(
    client: &dyn AnkiConnectClient,
    filename: &str,
) -> Result<Option<Vec<u8>>, AnkiConnectError> {
    let file: Value = call(client, "retrieveMediaFile", json!({ "filename": filename })).await?;
    let Some(encoded) = file.as_str() else {
        return Ok(None);
    };
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| AnkiConnectError::InvalidResponse)?;
    Ok(Some(bytes))
}

/// Anki's media folder, as Anki sees it.
pub async fn media_dir_path(client: &dyn AnkiConnectClient) -> Result<String, AnkiConnectError> {
    call(client, "getMediaDirPath", json!({})).await
}

/// Whether Anki sees a file named `filename` in its media folder.
pub async fn has_media_file(
    client: &dyn AnkiConnectClient,
    filename: &str,
) -> Result<bool, AnkiConnectError> {
    let params = json!({ "pattern": filename });
    let names: Vec<String> = call(client, "getMediaFilesNames", params).await?;
    Ok(names.iter().any(|name| name == filename))
}

/// Writes `data` to Anki's media folder, returning the name Anki gave the file.
pub async fn store_media_file(
    client: &dyn AnkiConnectClient,
    filename: &str,
    data: &[u8],
) -> Result<String, AnkiConnectError> {
    let data = general_purpose::STANDARD.encode(data);
    let params = json!({ "filename": filename, "data": data });
    call(client, "storeMediaFile", params).await
}

/// Moves a file in Anki's media folder to Anki's media trash.
pub async fn delete_media_file(
    client: &dyn AnkiConnectClient,
    filename: &str,
) -> Result<(), AnkiConnectError> {
    client
        .invoke("deleteMediaFile", json!({ "filename": filename }))
        .await?;
    Ok(())
}

/// Moves the cards to `deck`, creating it when missing.
pub async fn change_deck(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
    deck: &str,
) -> Result<(), AnkiConnectError> {
    client
        .invoke("changeDeck", json!({ "cards": cards, "deck": deck }))
        .await?;
    Ok(())
}

pub async fn delete_notes(
    client: &dyn AnkiConnectClient,
    notes: &[AnkiNoteId],
) -> Result<(), AnkiConnectError> {
    client
        .invoke("deleteNotes", json!({ "notes": notes }))
        .await?;
    Ok(())
}

pub async fn reviews_of_cards(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
) -> Result<HashMap<AnkiCardId, Vec<AnkiReview>>, AnkiConnectError> {
    let mut all = HashMap::with_capacity(cards.len());
    // Batched like `cardsInfo`, as a whole collection's reviews in one request outlast the timeout.
    for batch in cards.chunks(CARDS_INFO_BATCH) {
        let reviews: HashMap<String, Vec<AnkiReview>> =
            call(client, "getReviewsOfCards", json!({ "cards": batch })).await?;
        for (card, reviews) in reviews {
            let card = card
                .parse()
                .map_err(|_| AnkiConnectError::InvalidResponse)?;
            all.insert(AnkiCardId(card), reviews);
        }
    }
    Ok(all)
}

/// Inserts the reviews a batch per request. Anki's log is keyed by id alone and keeps the reviews of deleted
/// cards, so one id it holds refuses a whole batch: then each goes alone, a clash moved to a free millisecond
/// of its second.
pub async fn insert_reviews(
    client: &dyn AnkiConnectClient,
    rows: &[AnkiReviewRow],
) -> Result<(), AnkiConnectError> {
    for batch in rows.chunks(INSERT_REVIEWS_BATCH) {
        let log: Vec<[i64; 9]> = batch.iter().map(AnkiReviewRow::to_log_row).collect();
        match client
            .invoke("insertReviews", json!({ "reviews": log }))
            .await
        {
            Err(AnkiConnectError::Refused(error)) if is_review_id_clash(&error) => {
                insert_reviews_one_by_one(client, batch).await?
            }
            other => other.map(|_| ())?,
        }
    }
    Ok(())
}

fn is_review_id_clash(error: &str) -> bool {
    REVIEW_ID_CLASHES.iter().any(|clash| error.contains(clash))
}

/// Not all or none: reviews inserted before a failure stay, and the next sync matches them by the second.
async fn insert_reviews_one_by_one(
    client: &dyn AnkiConnectClient,
    rows: &[AnkiReviewRow],
) -> Result<(), AnkiConnectError> {
    let mut used: HashSet<i64> = rows.iter().map(|row| row.id).collect();
    let mut pending = rows.to_vec();
    let mut last_error = String::new();
    for _ in 0..REVIEW_ID_ATTEMPTS {
        let mut refused = Vec::new();
        for batch in pending.chunks(MULTI_BATCH) {
            let actions: Vec<Value> = batch
                .iter()
                .map(|row| {
                    json!({
                        "action": "insertReviews",
                        "version": MULTI_ACTION_VERSION,
                        "params": { "reviews": [row.to_log_row()] },
                    })
                })
                .collect();
            let results: Vec<MultiResult> =
                call(client, "multi", json!({ "actions": actions })).await?;
            if results.len() != batch.len() {
                return Err(AnkiConnectError::InvalidResponse);
            }
            for (row, result) in batch.iter().zip(results) {
                let Some(error) = result.error else { continue };
                if !is_review_id_clash(&error) {
                    return Err(AnkiConnectError::Refused(error));
                }
                last_error = error;
                refused.push(row.clone());
            }
        }
        if refused.is_empty() {
            return Ok(());
        }
        for row in &mut refused {
            row.id = free_id_in_second(row.id, &mut used)
                .ok_or_else(|| AnkiConnectError::Refused(last_error.clone()))?;
        }
        pending = refused;
    }
    Err(AnkiConnectError::Refused(last_error))
}

/// The next millisecond of `id`'s second not yet tried, wrapping round, since reviews merge by the second.
pub fn free_id_in_second(id: i64, used: &mut HashSet<i64>) -> Option<i64> {
    let second = id.div_euclid(1000) * 1000;
    let offset = id - second;
    (1..1000)
        .map(|step| second + (offset + step) % 1000)
        .find(|candidate| used.insert(*candidate))
}

/// Answers each card with its ease through Anki's own scheduler, so it enters Anki's (re)learning steps.
/// Returns the cards answered: one Anki can't answer, such as the card on its reviewer's screen, is left out.
pub async fn answer_cards(
    client: &dyn AnkiConnectClient,
    cards: &[(AnkiCardId, i64)],
) -> Result<HashSet<AnkiCardId>, AnkiConnectError> {
    let mut answered = HashSet::new();
    for batch in cards.chunks(MULTI_BATCH) {
        let actions: Vec<Value> = batch
            .iter()
            .map(|(card, ease)| {
                json!({
                    "action": "answerCards",
                    "version": MULTI_ACTION_VERSION,
                    "params": { "answers": [{ "cardId": card, "ease": ease }] },
                })
            })
            .collect();
        let results: Vec<MultiResult> =
            call(client, "multi", json!({ "actions": actions })).await?;
        if results.len() != batch.len() {
            return Err(AnkiConnectError::InvalidResponse);
        }
        for ((card, _), result) in batch.iter().zip(results) {
            if result.error.is_none() && result.result == json!([true]) {
                answered.insert(*card);
            }
        }
    }
    Ok(answered)
}

/// Sets each card's values, many cards per request through AnkiConnect's `multi` action.
pub async fn set_cards_values(
    client: &dyn AnkiConnectClient,
    cards: &[(AnkiCardId, AnkiCardValues)],
) -> Result<(), AnkiConnectError> {
    for batch in cards.chunks(MULTI_BATCH) {
        let actions: Vec<Value> = batch
            .iter()
            .map(|(card, values)| {
                let (keys, values) = values.keys_and_values();
                json!({
                    "action": "setSpecificValueOfCard",
                    "version": MULTI_ACTION_VERSION,
                    "params": { "card": card, "keys": keys, "newValues": values, "warning_check": true },
                })
            })
            .collect();
        let results: Vec<MultiResult> =
            call(client, "multi", json!({ "actions": actions })).await?;
        if results.len() != batch.len() {
            return Err(AnkiConnectError::InvalidResponse);
        }
        for result in results {
            if let Some(error) = result.error {
                return Err(AnkiConnectError::Refused(error));
            }
            match result.result {
                Value::Array(set) if set.iter().all(|value| value == &json!(true)) => {}
                other => return Err(AnkiConnectError::Refused(other.to_string())),
            }
        }
    }
    Ok(())
}

/// Makes the cards reviews due in `days` days, which also becomes their interval.
pub async fn set_due_date(
    client: &dyn AnkiConnectClient,
    cards: &[AnkiCardId],
    days: i64,
) -> Result<(), AnkiConnectError> {
    let params = json!({ "cards": cards, "days": format!("{days}!") });
    client.invoke("setDueDate", params).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn anki_today_card_due_in_three_days_returns_its_due_day_minus_three() {
        // Arrange

        let card = AnkiCardSchedule {
            card_id: AnkiCardId(7),
            due: 1_250,
            queue: 2,
            kind: 2,
            interval: 3,
        };
        let mut client = MockAnkiConnectClient::new();
        client.expect_invoke().returning(|_, params| {
            let query = params["query"].as_str().unwrap().to_string();
            let days: i64 = query.rsplit(">=").next().unwrap().parse().unwrap();
            let found = if days <= 3 { json!([7]) } else { json!([]) };
            Box::pin(async move { Ok(found) })
        });

        // Act

        let today = anki_today(&client, &card).await.unwrap();

        // Assert

        assert_eq!(1_247, today);
    }

    fn reflecting(actions: Value) -> MockAnkiConnectClient {
        let mut client = MockAnkiConnectClient::new();
        client.expect_invoke().returning(move |action, _| {
            let answer = match action {
                "apiReflect" => Ok(json!({ "scopes": ["actions"], "actions": actions.clone() })),
                _ => Ok(json!("User 1")),
            };
            Box::pin(async move { answer })
        });
        client
    }

    #[tokio::test]
    async fn active_profile_add_on_with_every_action_returns_the_profile() {
        // Arrange

        let client = reflecting(json!(REQUIRED_ACTIONS));

        // Act

        let profile = active_profile(&client).await;

        // Assert

        assert_eq!("User 1", profile.unwrap());
    }

    #[tokio::test]
    async fn active_profile_add_on_missing_an_action_returns_outdated() {
        // Arrange

        let client = reflecting(json!(["findCards", "notesInfo"]));

        // Act

        let profile = active_profile(&client).await;

        // Assert

        assert!(matches!(profile, Err(AnkiConnectError::Outdated)));
    }

    #[tokio::test]
    async fn active_profile_add_on_without_api_reflect_returns_outdated() {
        // Arrange

        let mut client = MockAnkiConnectClient::new();
        client.expect_invoke().returning(|_, _| {
            Box::pin(async { Err(AnkiConnectError::Refused(UNSUPPORTED_ACTION.into())) })
        });

        // Act

        let profile = active_profile(&client).await;

        // Assert

        assert!(matches!(profile, Err(AnkiConnectError::Outdated)));
    }

    #[tokio::test]
    async fn cards_info_more_cards_than_a_batch_asks_in_batches_and_drops_missing_ones() {
        // Arrange

        let cards: Vec<AnkiCardId> = (0..CARDS_INFO_BATCH as i64 + 1).map(AnkiCardId).collect();
        let mut client = MockAnkiConnectClient::new();
        client.expect_invoke().times(2).returning(|_, params| {
            let infos: Vec<Value> = params["cards"]
                .as_array()
                .unwrap()
                .iter()
                .map(|card| match card.as_i64() {
                    Some(0) => json!({}),
                    _ => json!({ "cardId": card, "note": 1, "ord": 0 }),
                })
                .collect();
            Box::pin(async move { Ok(json!(infos)) })
        });

        // Act

        let infos = cards_info(&client, &cards).await.unwrap();

        // Assert

        assert_eq!(CARDS_INFO_BATCH, infos.len());
    }

    /// Anki's review log: refuses a review whose id it already holds, as AnkiConnect does.
    struct ReviewLog {
        ids: std::sync::Mutex<HashSet<i64>>,
    }

    impl ReviewLog {
        fn insert(&self, reviews: &Value) -> Result<Value, AnkiConnectError> {
            let ids: Vec<i64> = reviews
                .as_array()
                .unwrap()
                .iter()
                .map(|row| row[0].as_i64().unwrap())
                .collect();
            let mut log = self.ids.lock().unwrap();
            if ids.iter().any(|id| log.contains(id)) {
                return Err(AnkiConnectError::Refused(
                    "Review ID already exists.".into(),
                ));
            }
            log.extend(ids);
            Ok(json!(true))
        }
    }

    #[async_trait]
    impl AnkiConnectClient for ReviewLog {
        async fn invoke(
            &self,
            action: &'static str,
            params: Value,
        ) -> Result<Value, AnkiConnectError> {
            match action {
                "insertReviews" => self.insert(&params["reviews"]),
                "multi" => Ok(params["actions"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|action| match self.insert(&action["params"]["reviews"]) {
                        Ok(result) => json!({ "result": result, "error": null }),
                        Err(error) => json!({ "result": null, "error": error.to_string() }),
                    })
                    .collect()),
                other => panic!("unexpected action {other}"),
            }
        }
    }

    fn review(id: i64) -> AnkiReviewRow {
        AnkiReviewRow {
            id,
            card_id: AnkiCardId(7),
            ease: 3,
            time_ms: 0,
            kind: 1,
        }
    }

    #[tokio::test]
    async fn insert_reviews_ids_anki_holds_moves_them_on_and_inserts_every_review() {
        // Arrange

        let client = ReviewLog {
            ids: std::sync::Mutex::new(HashSet::from([2_000, 2_001, 3_000])),
        };
        let rows = [review(1_000), review(2_000), review(3_000)];

        // Act

        insert_reviews(&client, &rows).await.unwrap();

        // Assert

        let expected = HashSet::from([1_000, 2_000, 2_001, 2_002, 3_000, 3_001]);
        assert_eq!(expected, *client.ids.lock().unwrap());
    }

    #[tokio::test]
    async fn insert_reviews_clash_at_the_end_of_a_second_keeps_it_in_that_second() {
        // Arrange

        let client = ReviewLog {
            ids: std::sync::Mutex::new(HashSet::from([1_999])),
        };

        // Act

        insert_reviews(&client, &[review(1_999)]).await.unwrap();

        // Assert

        let expected = HashSet::from([1_999, 1_000]);
        assert_eq!(expected, *client.ids.lock().unwrap());
    }

    #[tokio::test]
    async fn insert_reviews_refused_for_another_reason_returns_its_error_without_retrying() {
        // Arrange

        let mut client = MockAnkiConnectClient::new();
        client
            .expect_invoke()
            .withf(|action, _| action == "insertReviews")
            .times(1)
            .returning(|_, _| {
                Box::pin(async { Err(AnkiConnectError::Refused("collection is busy".into())) })
            });

        // Act

        let result = insert_reviews(&client, &[review(1_000)]).await;

        // Assert

        assert!(
            matches!(result, Err(AnkiConnectError::Refused(error)) if error == "collection is busy")
        );
    }

    #[tokio::test]
    async fn set_cards_values_one_action_refused_returns_its_error() {
        // Arrange

        let values = AnkiCardValues {
            interval_days: Some(3),
            reps: 1,
            lapses: 0,
        };
        let cards = [(AnkiCardId(1), values), (AnkiCardId(2), values)];
        let mut client = MockAnkiConnectClient::new();
        client
            .expect_invoke()
            .withf(|action, params| {
                action == "multi" && params["actions"].as_array().unwrap().len() == 2
            })
            .times(1)
            .returning(|_, _| {
                let results = json!([
                    { "result": [true, true, true], "error": null },
                    { "result": null, "error": "card was not found" },
                ]);
                Box::pin(async move { Ok(results) })
            });

        // Act

        let result = set_cards_values(&client, &cards).await;

        // Assert

        assert!(
            matches!(result, Err(AnkiConnectError::Refused(error)) if error == "card was not found")
        );
    }
}
