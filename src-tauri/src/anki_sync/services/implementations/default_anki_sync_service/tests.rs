use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::DateTime;
use injector::injector::Injector;
use serde_json::{Value, json};
use uuid::Uuid;

use super::review_sync::all_newer_than_amber;
use super::*;
use crate::anki_sync::anki_connect::{AnkiConnectError, AnkiNoteInfo, MockAnkiConnectClient};
use crate::anki_sync::entities::anki_card_pair::AnkiCardPair;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::entities::synced_schedule::SyncedSchedule;
use crate::anki_sync::notes::{EXPORT_VERSION, basic_note, fingerprint};
use crate::anki_sync::package::definitions::{AMBER_ID_FIELD, AMBER_TARGETS_FIELD};
use crate::anki_sync::schedules::anki_date;
use crate::anki_sync::services::sync_frontend::MockSyncFrontend;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::services::lexical_html_converter::{
    LexicalHtmlConverter, MockLexicalHtmlConverter,
};
use crate::common::utils::create_injector::create_injector;
use crate::common::utils::create_sqlite_pool::create_sqlite_pool;
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_folder_dto::CreateFolderDto;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::{MaskShape, OcclusionShape};
use crate::import::anki::entities::anki_card_link::AnkiCardLink;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;
use crate::import::repositories::anki_card_link_repository::AnkiCardLinkRepository;
use crate::import::services::anki_import_service::{AnkiImportError, MockAnkiImportService};
use crate::import::services::imported_html_converter::{
    ImportedHtmlConverter, MockImportedHtmlConverter,
};
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::infrastructure::value_objects::app_data_directory::AppDataDirectory;
use crate::infrastructure::value_objects::db_pool::DbPool;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::settings::value_objects::database_location::DatabaseLocation;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::utils::day_boundary::start_of_day_utc;
use crate::study::value_objects::card_state::CardState;
use crate::study::value_objects::rating::Rating;
use crate::sync::store::MockSyncStore;
use crate::test_utils::create_temp_directory;
use base64::Engine as _;

const PROFILE: &str = "User 1";
/// The fake Anki's day number for today.
const ANKI_TODAY: i64 = 1_000;

/// Where Anki's media folder is when Amber can't reach it.
const UNREACHABLE_MEDIA_DIR: &str = "/nonexistent/anki/collection.media";
/// AnkiConnect turns away a larger request.
const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;

/// How Amber sees Anki's media folder.
enum MediaFolderAccess {
    /// Out of reach, as from a Flatpak or Snap.
    Unreachable,
    /// The same folder Anki uses.
    Shared(std::path::PathBuf),
    /// Readable there, but what Amber writes lands in a copy only it sees, as under MSIX.
    Redirected(std::path::PathBuf),
}

/// Where a card of Amber's lands in Anki when nothing put it elsewhere.
const DEFAULT_AMBER_DECK: &str = "Spanish";

/// Amber's notes and cards as Anki holds them, changed as Anki's importer would.
struct AnkiCollection {
    /// As `notesInfo` gives them, with the Amber ID field naming each one's guid.
    notes: Vec<Value>,
    /// Each card as (card, note, ordinal).
    cards: Vec<(i64, i64, usize)>,
    /// The deck of each card that has one other than `DEFAULT_AMBER_DECK`.
    card_decks: HashMap<i64, String>,
    next_id: i64,
}

impl AnkiCollection {
    fn guid_of(note: &Value) -> Option<&str> {
        note["fields"][AMBER_ID_FIELD]["value"].as_str()
    }

    /// Adds or updates the package's notes like Anki's importer: a note it holds changes only when the
    /// package's copy is newer, and its cards stay in their decks.
    fn import(&mut self, package: &[u8]) {
        let collection = read_package(package);
        for note in collection.notes {
            let cards = collection.cards.iter().filter(|card| card.0 == note.id);
            let existing = self
                .notes
                .iter()
                .position(|held| Self::guid_of(held) == Some(note.guid.as_str()));
            let index = match existing {
                Some(index) if self.notes[index]["mod"].as_i64().unwrap_or(0) >= note.modified => {
                    continue;
                }
                Some(index) => index,
                None => {
                    self.next_id += 1;
                    self.notes
                        .push(json!({ "noteId": self.next_id, "cards": [] }));
                    self.notes.len() - 1
                }
            };
            let note_id = self.notes[index]["noteId"].as_i64().unwrap();
            let (model, field_names) = &collection.notetypes[&note.notetype_id];
            let fields: serde_json::Map<String, Value> = field_names
                .iter()
                .zip(note.fields.split('\x1f'))
                .enumerate()
                .map(|(order, (name, value))| {
                    (name.clone(), json!({ "value": value, "order": order }))
                })
                .collect();
            self.notes[index]["fields"] = json!(fields);
            self.notes[index]["mod"] = json!(note.modified);
            self.notes[index]["modelName"] = json!(model);
            for &(_, deck_id, ord) in cards {
                let held = self
                    .cards
                    .iter()
                    .any(|card| card.1 == note_id && card.2 == ord);
                if held {
                    continue;
                }
                self.next_id += 1;
                let card = self.next_id;
                self.cards.push((card, note_id, ord));
                self.card_decks
                    .insert(card, collection.decks[&deck_id].clone());
                self.notes[index]["cards"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(card));
            }
        }
    }

    fn deck_of(&self, card: i64) -> &str {
        self.card_decks
            .get(&card)
            .map_or(DEFAULT_AMBER_DECK, String::as_str)
    }
}

struct PackageNote {
    id: i64,
    guid: String,
    notetype_id: i64,
    modified: i64,
    fields: String,
}

/// What a package's collection holds, read as Anki's importer reads it.
struct PackageCollection {
    /// Each notetype's name and field names, by id.
    notetypes: HashMap<i64, (String, Vec<String>)>,
    decks: HashMap<i64, String>,
    notes: Vec<PackageNote>,
    /// Each card as (note, deck, ordinal).
    cards: Vec<(i64, i64, usize)>,
}

fn read_package(package: &[u8]) -> PackageCollection {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(package)).unwrap();
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut zip.by_name("collection.anki2").unwrap(), &mut bytes).unwrap();
    let path = std::env::temp_dir().join(format!("fake-anki-{}.anki2", Uuid::new_v4()));
    std::fs::write(&path, bytes).unwrap();
    let conn = rusqlite::Connection::open(&path).unwrap();
    let (models, decks): (String, String) = conn
        .query_row("SELECT models, decks FROM col", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap();
    let models: HashMap<String, Value> = serde_json::from_str(&models).unwrap();
    let notetypes = models
        .into_iter()
        .map(|(id, model)| {
            let names = model["flds"].as_array().unwrap();
            let names = names
                .iter()
                .map(|field| field["name"].as_str().unwrap().to_string());
            let model_name = model["name"].as_str().unwrap().to_string();
            (id.parse().unwrap(), (model_name, names.collect()))
        })
        .collect();
    let decks: HashMap<String, Value> = serde_json::from_str(&decks).unwrap();
    let decks = decks
        .into_iter()
        .map(|(id, deck)| {
            (
                id.parse().unwrap(),
                deck["name"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    let notes = conn
        .prepare("SELECT id, guid, mid, mod, flds FROM notes")
        .unwrap()
        .query_map([], |row| {
            Ok(PackageNote {
                id: row.get(0)?,
                guid: row.get(1)?,
                notetype_id: row.get(2)?,
                modified: row.get(3)?,
                fields: row.get(4)?,
            })
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let cards = conn
        .prepare("SELECT nid, did, ord FROM cards")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    drop(conn);
    let _ = std::fs::remove_file(path);
    PackageCollection {
        notetypes,
        decks,
        notes,
        cards,
    }
}

/// An Anki holding `anki_cards` in the deck `Spanish::Verbs`, and `amber_notes` of Amber's.
struct FakeAnki {
    anki_cards: Vec<i64>,
    filtered_cards: Vec<i64>,
    suspended_cards: Vec<i64>,
    amber_notes: Vec<Value>,
    /// Each of Amber's cards as (card, note, ordinal).
    amber_cards: Vec<(i64, i64, usize)>,
    /// `amber_notes` and `amber_cards` once Anki first reads them, with what imports did to them.
    collection: Mutex<Option<AnkiCollection>>,
    reviews: Value,
    /// Notes of Anki's own cards edited lately, as `notesInfo` gives them.
    edited_notes: Vec<Value>,
    /// What exporting a deck gives.
    package: Vec<u8>,
    /// Anki's media folder, by filename.
    media: HashMap<String, Vec<u8>>,
    media_access: MediaFolderAccess,
    /// Files Anki added to a media folder Amber doesn't share.
    stored_media: Mutex<HashMap<String, Vec<u8>>>,
    /// Files moved to Anki's media trash.
    trashed_media: Mutex<Vec<String>>,
    /// Each package imported, as Anki read it.
    imported_packages: Mutex<Vec<Vec<u8>>>,
    refuses_imports: bool,
    /// Each card's `cardsInfo` schedule fields; cards left out are new.
    schedules: Mutex<HashMap<i64, Value>>,
    exported_decks: Mutex<Vec<String>>,
    deleted_notes: Mutex<Vec<i64>>,
    calls: Mutex<Vec<(&'static str, Value)>>,
    /// Commits a write through this pool during every call, the way the user can while syncing.
    concurrent_writer: Mutex<Option<sqlx::SqlitePool>>,
    /// Cards answered through `answerCards`, each with the review id Anki logged for it and the ease.
    answered: Mutex<Vec<(i64, i64, i64)>>,
    /// Refuses `answerCards`, as Anki does for the card on its reviewer's screen.
    refuses_answers: bool,
}

impl FakeAnki {
    fn new(anki_cards: Vec<i64>) -> Self {
        Self {
            anki_cards,
            filtered_cards: Vec::new(),
            suspended_cards: Vec::new(),
            amber_notes: Vec::new(),
            amber_cards: Vec::new(),
            collection: Mutex::default(),
            reviews: json!({}),
            edited_notes: Vec::new(),
            package: b"package".to_vec(),
            media: HashMap::new(),
            media_access: MediaFolderAccess::Unreachable,
            stored_media: Mutex::default(),
            trashed_media: Mutex::default(),
            imported_packages: Mutex::default(),
            refuses_imports: false,
            schedules: Mutex::default(),
            exported_decks: Mutex::default(),
            deleted_notes: Mutex::default(),
            calls: Mutex::default(),
            concurrent_writer: Mutex::default(),
            answered: Mutex::default(),
            refuses_answers: false,
        }
    }

    fn holding(anki_cards: Vec<i64>) -> Arc<Self> {
        Arc::new(Self::new(anki_cards))
    }

    /// Makes `card` a review card due `days` from Anki's today.
    fn schedule(&self, card: i64, days: i64) {
        let schedule = json!({
            "cardId": card, "due": ANKI_TODAY + days, "queue": 2, "type": 2, "interval": days,
        });
        self.schedules.lock().unwrap().insert(card, schedule);
    }

    fn due_day(&self, card: &Value) -> Option<i64> {
        let schedules = self.schedules.lock().unwrap();
        schedules
            .get(&card.as_i64()?)
            .and_then(|s| s["due"].as_i64())
    }

    fn collection<T>(&self, read: impl FnOnce(&mut AnkiCollection) -> T) -> T {
        let mut collection = self.collection.lock().unwrap();
        let collection = collection.get_or_insert_with(|| AnkiCollection {
            notes: self.amber_notes.clone(),
            cards: self.amber_cards.clone(),
            card_decks: HashMap::new(),
            next_id: 1_000_000,
        });
        read(collection)
    }

    /// The deck Anki holds `card` in.
    fn deck_of(&self, card: i64) -> String {
        self.collection(|collection| collection.deck_of(card).to_string())
    }

    fn media_dir(&self) -> String {
        match &self.media_access {
            MediaFolderAccess::Unreachable => UNREACHABLE_MEDIA_DIR.to_string(),
            MediaFolderAccess::Shared(dir) | MediaFolderAccess::Redirected(dir) => {
                dir.to_string_lossy().into_owned()
            }
        }
    }

    /// The folder Anki and Amber both write to, if any.
    fn shared_dir(&self) -> Option<&std::path::Path> {
        match &self.media_access {
            MediaFolderAccess::Shared(dir) => Some(dir),
            _ => None,
        }
    }

    /// The name of a file at `path` in Anki's media folder; Anki writes nowhere else here.
    fn media_name(&self, path: &str) -> String {
        let path = std::path::Path::new(path);
        assert_eq!(self.media_dir(), path.parent().unwrap().to_string_lossy());
        path.file_name().unwrap().to_string_lossy().into_owned()
    }

    fn read_media(&self, name: &str) -> Option<Vec<u8>> {
        if let Some(bytes) = self
            .shared_dir()
            .and_then(|dir| std::fs::read(dir.join(name)).ok())
        {
            return Some(bytes);
        }
        let stored = self.stored_media.lock().unwrap().get(name).cloned();
        stored.or_else(|| self.media.get(name).cloned())
    }

    fn write_media(&self, name: &str, bytes: Vec<u8>) {
        match self.shared_dir() {
            Some(dir) => std::fs::write(dir.join(name), bytes).unwrap(),
            None => {
                self.stored_media
                    .lock()
                    .unwrap()
                    .insert(name.to_string(), bytes);
            }
        }
    }

    fn delete_media(&self, name: &str) {
        if let Some(dir) = self.shared_dir() {
            let _ = std::fs::remove_file(dir.join(name));
        }
        self.stored_media.lock().unwrap().remove(name);
        self.trashed_media.lock().unwrap().push(name.to_string());
    }

    /// The packages left in Anki's media folder.
    fn packages_left(&self) -> Vec<String> {
        let mut names: Vec<String> = self.stored_media.lock().unwrap().keys().cloned().collect();
        if let MediaFolderAccess::Shared(dir) | MediaFolderAccess::Redirected(dir) =
            &self.media_access
        {
            let files = std::fs::read_dir(dir).unwrap();
            names
                .extend(files.map(|file| file.unwrap().file_name().to_string_lossy().into_owned()));
        }
        names.retain(|name| super::transfer::is_package(std::path::Path::new(name)));
        names
    }

    fn params_of(&self, action: &str) -> Vec<Value> {
        let calls = self.calls.lock().unwrap();
        let calls = calls.iter().filter(|(called, _)| *called == action);
        calls.map(|(_, params)| params.clone()).collect()
    }
}

#[async_trait]
impl AnkiConnectClient for FakeAnki {
    async fn invoke(&self, action: &'static str, params: Value) -> Result<Value, AnkiConnectError> {
        self.calls.lock().unwrap().push((action, params.clone()));
        let writer = self.concurrent_writer.lock().unwrap().clone();
        if let Some(pool) = writer {
            sqlx::query("INSERT OR REPLACE INTO anki_profiles VALUES ('Concurrent', 0)")
                .execute(&pool)
                .await
                .unwrap();
        }
        match action {
            "getActiveProfile" => Ok(json!(PROFILE)),
            "apiReflect" => Ok(json!({ "scopes": ["actions"], "actions": params["actions"] })),
            "findCards" if params["query"] == ANKI_CARDS_QUERY => Ok(json!(self.anki_cards)),
            "findCards" if params["query"] == FILTERED_CARDS_QUERY => {
                Ok(json!(self.filtered_cards))
            }
            "findCards" if params["query"] == SUSPENDED_CARDS_QUERY => {
                Ok(json!(self.suspended_cards))
            }
            "findCards" if params["query"] == AMBER_NOTES_QUERY => {
                let cards: Vec<i64> = self
                    .collection(|collection| collection.cards.iter().map(|card| card.0).collect());
                Ok(json!(cards))
            }
            "findNotes" if params["query"].as_str().unwrap().starts_with("edited:") => {
                let notes: Vec<&Value> = self.edited_notes.iter().map(|n| &n["noteId"]).collect();
                Ok(json!(notes))
            }
            "findNotes" => {
                let notes: Vec<Value> = self.collection(|collection| {
                    let notes = collection.notes.iter();
                    notes.map(|note| note["noteId"].clone()).collect()
                });
                Ok(json!(notes))
            }
            "getDecks" => Ok(json!({ "Spanish::Verbs": params["cards"] })),
            "exportPackage" => {
                let name = self.media_name(params["path"].as_str().unwrap());
                self.write_media(&name, self.package.clone());
                let deck = params["deck"].as_str().unwrap().to_string();
                self.exported_decks.lock().unwrap().push(deck);
                Ok(json!(true))
            }
            "cardsInfo" if params.get("fields").is_some() => {
                let schedules = self.schedules.lock().unwrap();
                let infos: Vec<Value> = params["cards"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|card| {
                        let new = json!({ "cardId": card, "due": 0, "queue": 0, "type": 0, "interval": 0 });
                        schedules.get(&card.as_i64().unwrap()).cloned().unwrap_or(new)
                    })
                    .collect();
                Ok(json!(infos))
            }
            "findCards" if params["query"].as_str().unwrap().starts_with("cid:") => {
                let query = params["query"].as_str().unwrap();
                let (card, days) = query["cid:".len()..].split_once(" prop:due>=").unwrap();
                let card = json!(card.parse::<i64>().unwrap());
                let days: i64 = days.parse().unwrap();
                let found = self
                    .due_day(&card)
                    .is_some_and(|due| due - ANKI_TODAY >= days);
                Ok(if found { json!([card]) } else { json!([]) })
            }
            "setDueDate" => {
                let days = params["days"].as_str().unwrap().trim_end_matches('!');
                for card in params["cards"].as_array().unwrap() {
                    self.schedule(card.as_i64().unwrap(), days.parse().unwrap());
                }
                Ok(Value::Null)
            }
            "cardsInfo" => {
                let infos: Vec<Value> = params["cards"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|card| {
                        let id = card.as_i64().unwrap();
                        let amber = self.collection(|collection| {
                            collection.cards.iter().find(|amber| id == amber.0).copied()
                        });
                        let (note, ord) =
                            amber.map_or((card.clone(), 0), |amber| (json!(amber.1), amber.2));
                        let deck = self.deck_of(id);
                        json!({ "cardId": card, "note": note, "ord": ord, "deckName": deck })
                    })
                    .collect();
                Ok(json!(infos))
            }
            "notesInfo" => {
                let infos: Vec<Value> = params["notes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|note| {
                        let amber = self.collection(|collection| {
                            let held = collection
                                .notes
                                .iter()
                                .find(|amber| amber["noteId"] == *note);
                            held.cloned()
                        });
                        let edited = || {
                            let mut edited = self.edited_notes.iter();
                            edited.find(|edited| edited["noteId"] == *note).cloned()
                        };
                        amber.or_else(edited).unwrap_or_else(
                            || json!({ "noteId": note, "fields": {}, "cards": [note] }),
                        )
                    })
                    .collect();
                Ok(json!(infos))
            }
            "deleteNotes" => {
                let notes = params["notes"].as_array().unwrap();
                let mut deleted = self.deleted_notes.lock().unwrap();
                deleted.extend(notes.iter().map(|note| note.as_i64().unwrap()));
                self.collection(|collection| {
                    collection
                        .notes
                        .retain(|held| !notes.contains(&held["noteId"]));
                    collection
                        .cards
                        .retain(|card| !notes.contains(&json!(card.1)));
                });
                Ok(Value::Null)
            }
            "importPackage" => {
                let name = self.media_name(params["path"].as_str().unwrap());
                let package = self.read_media(&name);
                let package = package
                    .ok_or_else(|| AnkiConnectError::Refused("Package not found.".to_string()))?;
                if self.refuses_imports {
                    return Err(AnkiConnectError::Refused("Import failed".to_string()));
                }
                self.collection(|collection| collection.import(&package));
                self.imported_packages.lock().unwrap().push(package);
                Ok(json!(true))
            }
            "retrieveMediaFile" => {
                let file = self.read_media(params["filename"].as_str().unwrap());
                Ok(file.map_or(json!(false), |bytes| {
                    json!(base64::engine::general_purpose::STANDARD.encode(bytes))
                }))
            }
            "getMediaDirPath" => Ok(json!(self.media_dir())),
            "getMediaFilesNames" => {
                let name = params["pattern"].as_str().unwrap();
                let found = self.read_media(name).is_some();
                Ok(if found { json!([name]) } else { json!([]) })
            }
            "storeMediaFile" => {
                let data = params["data"].as_str().unwrap();
                if data.len() > MAX_REQUEST_BYTES {
                    return Err(AnkiConnectError::Unreachable);
                }
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(data)
                    .unwrap();
                let name = params["filename"].as_str().unwrap();
                self.write_media(name, bytes);
                Ok(json!(name))
            }
            "deleteMediaFile" => {
                self.delete_media(params["filename"].as_str().unwrap());
                Ok(Value::Null)
            }
            "getReviewsOfCards" => {
                let mut reviews = self.reviews.clone();
                for (card, id, ease) in self.answered.lock().unwrap().iter() {
                    let logged =
                        json!({ "id": id, "ease": ease, "time": 0, "ivl": -600, "type": 2 });
                    let card_reviews = reviews
                        .as_object_mut()
                        .unwrap()
                        .entry(card.to_string())
                        .or_insert_with(|| json!([]));
                    card_reviews.as_array_mut().unwrap().push(logged);
                }
                Ok(reviews)
            }
            "multi" => {
                let results: Vec<Value> = params["actions"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|action| {
                        if action["action"] == "answerCards" {
                            if self.refuses_answers {
                                return json!({ "result": null, "error": "card is being reviewed" });
                            }
                            let answer = &action["params"]["answers"][0];
                            let card = answer["cardId"].as_i64().unwrap();
                            let ease = answer["ease"].as_i64().unwrap();
                            let id = chrono::Utc::now().timestamp_millis();
                            self.answered.lock().unwrap().push((card, id, ease));
                            return json!({ "result": [true], "error": null });
                        }
                        assert_eq!("setSpecificValueOfCard", action["action"]);
                        let keys = action["params"]["keys"].as_array().unwrap();
                        let set: Vec<bool> = keys.iter().map(|_| true).collect();
                        json!({ "result": set, "error": null })
                    })
                    .collect();
                Ok(json!(results))
            }
            "changeDeck" => {
                let deck = params["deck"].as_str().unwrap().to_string();
                self.collection(|collection| {
                    for card in params["cards"].as_array().unwrap() {
                        collection
                            .card_decks
                            .insert(card.as_i64().unwrap(), deck.clone());
                    }
                });
                Ok(Value::Null)
            }
            "suspend" | "insertReviews" => Ok(Value::Null),
            "findCards" => Ok(json!([])),
            other => panic!("unexpected action {other}"),
        }
    }
}

async fn injector(anki: Arc<FakeAnki>, import_service: MockAnkiImportService) -> Injector {
    let app = tauri::test::mock_app();
    let directory = AppDataDirectory::new(create_temp_directory().await);
    let mut injector = create_injector(directory, app.handle().clone()).await;
    injector.register_singleton::<dyn AnkiConnectClient>(anki);
    injector.register_singleton::<dyn AnkiImportService>(Arc::new(import_service));
    let mut converter = MockLexicalHtmlConverter::new();
    converter.expect_convert_to_html().returning(|contents| {
        let htmls = contents.iter().map(|_| String::new()).collect();
        Box::pin(async move { Ok(htmls) })
    });
    injector.register_singleton::<dyn LexicalHtmlConverter>(Arc::new(converter));
    // Wraps the HTML as Lexical JSON would, so saving the card keeps it whole.
    let mut html_converter = MockImportedHtmlConverter::new();
    html_converter.expect_convert().returning(|htmls| {
        let contents = htmls
            .iter()
            .map(|html| json!({ "html": html }).to_string())
            .collect();
        Box::pin(async move { Ok(contents) })
    });
    injector.register_singleton::<dyn ImportedHtmlConverter>(Arc::new(html_converter));
    let mut frontend = MockSyncFrontend::new();
    frontend.expect_report_progress().returning(|_, _, _| ());
    frontend.expect_replay_reviews().returning(|cards| {
        let reviews = cards.iter().map(|card| replayed(card.card_id)).collect();
        Box::pin(async move { Ok(reviews) })
    });
    injector.register_singleton::<dyn SyncFrontend>(Arc::new(frontend));
    injector
}

/// A file in WAL mode, like the app's: a second connection deadlocks on a shared-cache `:memory:` one.
async fn use_file_database(injector: &mut Injector) {
    let directory = create_temp_directory().await;
    let url = format!("sqlite:///{}", directory.join("amber.db").to_string_lossy());
    let (pool, sync_clock) = create_sqlite_pool(&url).await.unwrap();
    let location = DatabaseLocation::new_unchecked(directory);
    injector.register_singleton(Arc::new(DbPool::new(pool, location, sync_clock)));
}

/// What the frontend's scheduler answers, with a due date of its own.
fn replayed(card_id: Uuid) -> CardReview {
    CardReview {
        card_id,
        due: chrono::DateTime::from_timestamp(9_000_000, 0).unwrap(),
        stability: 5.0,
        difficulty: 6.0,
        reps: 1,
        lapses: 0,
        state: crate::study::value_objects::card_state::CardState::Review,
        last_reviewed: None,
        scheduled_days: 3,
        learning_steps: 0,
    }
}

fn importing_nothing() -> MockAnkiImportService {
    let mut import_service = MockAnkiImportService::new();
    import_service.expect_import_cards().never();
    import_service
}

fn pair(card_id: Uuid, anki_card_id: i64) -> AnkiCardPair {
    AnkiCardPair {
        card_id,
        anki_card_id: AnkiCardId(anki_card_id),
    }
}

fn choice(deck: &str, import: bool) -> AnkiDeckChoice {
    AnkiDeckChoice {
        deck: deck.to_string(),
        import,
    }
}

async fn create_card(scope: &injector::injector_scope::InjectorScope<'_>) -> Uuid {
    let id = Uuid::new_v4();
    create_card_with_id(scope, id).await;
    id
}

async fn create_card_with_id(scope: &injector::injector_scope::InjectorScope<'_>, id: Uuid) {
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_card(CreateCardDto {
            id,
            meta: CreateMetaDto {
                name: Some("Card".to_string()),
                parent: None,
                origin: Origin::Custom {
                    derived_from: None,
                    bibliographical_source_id: None,
                },
            },
            front: String::new(),
            back: String::new(),
        })
        .await
        .unwrap();
}

/// An occlusion with a card for the target `a` only, drawing `masks`.
async fn create_occlusion(
    scope: &injector::injector_scope::InjectorScope<'_>,
    masks: &[&str],
) -> Uuid {
    let id = Uuid::new_v4();
    let shapes = masks.iter().map(|mask| {
        OcclusionShape::Rect(MaskShape {
            id: (*mask).into(),
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            rotation: 0.0,
            fill: "#ff0000".into(),
            group_id: None,
        })
    });
    let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
    repository
        .create(&ImageOcclusion {
            id,
            name: "Heart".into(),
            image_asset_id: AssetId::from_bytes(b"image"),
            image_width: 100,
            image_height: 100,
            shapes: shapes.collect(),
            mode: OcclusionMode::HideOneGuessOne,
            parent_id: None,
        })
        .await
        .unwrap();
    repository
        .link_card(&ImageOcclusionCardLink {
            card_id: create_card(scope).await,
            occlusion_id: id,
            target_key: "a".into(),
        })
        .await
        .unwrap();
    id
}

/// Anki's copy of an occlusion with the targets `a` and `b`, as cards 1 and 2 of the note 100.
fn anki_with_occlusion(occlusion: Uuid) -> Arc<FakeAnki> {
    Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": {
                AMBER_ID_FIELD: { "value": occlusion.hyphenated().to_string() },
                AMBER_TARGETS_FIELD: { "value": r#"["a","b"]"# },
            },
            "cards": [1, 2],
        })],
        amber_cards: vec![(1, 100, 0), (2, 100, 1)],
        ..FakeAnki::new(Vec::new())
    })
}

async fn is_live(scope: &injector::injector_scope::InjectorScope<'_>, id: Uuid) -> bool {
    let metas = scope.resolve::<dyn MetaRepository>().await;
    metas
        .get_all_ordered_by_priority()
        .await
        .unwrap()
        .iter()
        .any(|meta| meta.element_id == ElementId::Card(id))
}

#[tokio::test]
async fn status_anki_unreachable_returns_the_reason() {
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let mut client = MockAnkiConnectClient::new();
    client
        .expect_invoke()
        .returning(|_, _| Box::pin(async { Err(AnkiConnectError::Unreachable) }));
    injector.register_singleton::<dyn AnkiConnectClient>(Arc::new(client));
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let status = service.status().await.unwrap();

    // Assert

    assert_eq!(None, status.profile);
    assert_eq!(
        Some(AnkiConnectError::Unreachable.to_string()),
        status.error
    );
}

#[tokio::test]
async fn sync_anki_reviewed_last_card_takes_anki_due_and_keeps_replayed_memory() {
    // Arrange

    let reviewed_at_ms = 5_000_000_000_i64;
    let anki = Arc::new(FakeAnki {
        reviews: json!({ "7": [{
            "id": reviewed_at_ms, "ease": 3, "time": 1000, "ivl": 12, "type": 1,
        }] }),
        ..FakeAnki::new(vec![7])
    });
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let link = AnkiCardLink {
        card_id,
        anki_card_id: AnkiCardId(7),
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links.create(&link).await.unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let reviewed_at = chrono::DateTime::from_timestamp(reviewed_at_ms / 1000, 0).unwrap();
    let expected = start_of_day_utc(anki_date(reviewed_at) + chrono::Duration::days(12));
    assert_eq!(expected, review.due);
    assert_eq!(12, review.scheduled_days);
    assert_eq!(5.0, review.stability);
}

#[tokio::test]
async fn sync_anki_reviewed_then_rescheduled_card_takes_its_current_anki_due() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        reviews: json!({ "7": [{
            "id": 5_000_000_000_i64, "ease": 3, "time": 1000, "ivl": 12, "type": 1,
        }] }),
        ..FakeAnki::new(vec![7])
    });
    anki.schedule(7, 20);
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let today = anki_date(chrono::Utc::now());
    assert_eq!(
        start_of_day_utc(today + chrono::Duration::days(20)),
        review.due
    );
    assert_eq!(20, review.scheduled_days);
}

#[tokio::test]
async fn sync_chosen_deck_imported_from_its_top_level_deck() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let wanted = Arc::new(Mutex::new(Vec::new()));
    let recorded = wanted.clone();
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(move |bytes, cards, _, source, _| {
            assert_eq!(b"package".to_vec(), bytes);
            assert!(source.is_some());
            recorded.lock().unwrap().extend(cards);
            Box::pin(async { Ok::<usize, AnkiImportError>(1) })
        });
    let injector = injector(anki.clone(), import_service).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(vec![choice("Spanish", true)]).await.unwrap();

    // Assert

    assert_eq!(1, summary.imported_cards);
    assert_eq!(vec![AnkiCardId(7)], *wanted.lock().unwrap());
    assert_eq!(vec!["Spanish"], *anki.exported_decks.lock().unwrap());
}

#[tokio::test]
async fn sync_undecided_or_declined_deck_not_imported() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let undecided = service.sync(Vec::new()).await.unwrap();
    let declined = service.sync(vec![choice("Spanish", false)]).await.unwrap();

    // Assert

    assert_eq!(0, undecided.imported_cards + declined.imported_cards);
    assert!(anki.exported_decks.lock().unwrap().is_empty());
}

#[tokio::test]
async fn preview_new_deck_listed_undecided_and_nothing_changed() {
    // Arrange

    let anki = FakeAnki::holding(vec![7, 8]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    assert!(preview.is_first_sync);
    assert_eq!(
        vec![AnkiDeckPreview {
            name: "Spanish".to_string(),
            new_cards: 2,
            import: None,
        }],
        preview.decks
    );
    assert!(anki.exported_decks.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_card_trashed_in_amber_not_imported_again_or_deleted_in_anki() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let link = AnkiCardLink {
        card_id,
        anki_card_id: AnkiCardId(7),
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links.create(&link).await.unwrap();
    let trash = scope.resolve::<dyn TrashService>().await;
    trash.trash_element(ElementId::Card(card_id)).await.unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(vec![choice("Spanish", true)]).await.unwrap();

    // Assert

    assert_eq!(0, summary.imported_cards);
    assert_eq!(0, summary.deleted_notes);
    assert!(anki.deleted_notes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_card_deleted_for_good_in_amber_deletes_its_anki_note() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let mut injector = injector(anki.clone(), importing_nothing()).await;
    let mut sync_store = MockSyncStore::new();
    sync_store.expect_deleted_rows().returning(|table, keys| {
        let deleted = if table == "cards" {
            keys.iter().cloned().collect()
        } else {
            HashSet::new()
        };
        Box::pin(std::future::ready(Ok(deleted)))
    });
    injector.register_singleton::<dyn SyncStore>(Arc::new(sync_store));
    let scope = injector.start_scope();
    let link = AnkiCardLink {
        card_id: Uuid::new_v4(),
        anki_card_id: AnkiCardId(7),
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links.create(&link).await.unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, preview.notes_to_delete);
    assert_eq!(1, summary.deleted_notes);
    assert_eq!(vec![7], *anki.deleted_notes.lock().unwrap());
}

/// Gives the card the tombstone of an earlier delete, as one left by a card that came back since.
async fn add_old_tombstone(scope: &injector::injector_scope::InjectorScope<'_>, card_id: Uuid) {
    let tx = scope.resolve::<DbTransaction>().await;
    let mut guard = tx.lock().await;
    sqlx::query(
        "INSERT INTO sync_cells(tbl, row_id, col, value, hlc, device_id) \
         VALUES ('cards', json_array(?1), '__deleted', NULL, '000000000000001-00000000-old', 'old')",
    )
    .bind(card_id.hyphenated().to_string())
    .execute(guard.as_mut())
    .await
    .unwrap();
}

#[tokio::test]
async fn sync_amber_card_back_after_an_old_delete_keeps_its_anki_note() {
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        add_old_tombstone(&scope, card_id).await;
        scope.save_changes().await.unwrap();
        card_id
    };
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() } },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(0, preview.notes_to_delete);
    assert_eq!(0, summary.deleted_notes);
    assert!(anki.deleted_notes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_imported_card_back_after_an_old_delete_keeps_its_anki_note() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    add_old_tombstone(&scope, card_id).await;
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(0, preview.notes_to_delete);
    assert_eq!(0, summary.deleted_notes);
    assert!(anki.deleted_notes.lock().unwrap().is_empty());
    assert!(is_live(&scope, card_id).await);
}

#[tokio::test]
async fn sync_card_deleted_in_anki_goes_to_amber_trash() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .replace_paired_cards(PROFILE, &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, preview.cards_to_trash);
    assert_eq!(1, summary.trashed_cards);
    assert!(!is_live(&scope, card_id).await);
}

#[tokio::test]
async fn sync_card_paired_in_another_profile_stays_when_this_one_lacks_it() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .replace_paired_cards("Another profile", &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(0, summary.trashed_cards);
    assert!(is_live(&scope, card_id).await);
}

#[tokio::test]
async fn sync_cancelled_during_import_stops_with_cancelled() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(|_, _, _, _, _| Box::pin(async { Err::<usize, _>(AnkiImportError::Cancelled) }));
    let injector = injector(anki, import_service).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let result = service.sync(vec![choice("Spanish", true)]).await;

    // Assert

    assert!(matches!(result, Err(AnkiSyncError::Cancelled)));
}

#[tokio::test]
async fn sync_amber_written_during_every_anki_call_still_finishes() {
    // Arrange

    let anki = FakeAnki::holding(vec![7, 8]);
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(|_, _, _, _, _| Box::pin(async { Ok::<usize, AnkiImportError>(1) }));
    let mut injector = injector(anki.clone(), import_service).await;
    use_file_database(&mut injector).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let link = AnkiCardLink {
        card_id,
        anki_card_id: AnkiCardId(8),
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links.create(&link).await.unwrap();
    let now = chrono::Utc::now();
    let log = CardReviewLog {
        id: Uuid::new_v4(),
        card_id: Some(card_id),
        reviewed_at: now,
        rating: Rating::Good,
        duration_ms: Some(1000),
    };
    let logs = scope.resolve::<dyn CardReviewLogRepository>().await;
    logs.create(&log).await.unwrap();
    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = CardReview {
        due: now + chrono::Duration::days(5),
        ..replayed(card_id)
    };
    reviews.upsert(&review).await.unwrap();
    scope.save_changes().await.unwrap();
    let pool = scope.resolve::<DbPool>().await.pool().await.clone();
    *anki.concurrent_writer.lock().unwrap() = Some(pool);
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let result = service.sync(vec![choice("Spanish", true)]).await;

    // Assert

    assert_eq!(1, result.unwrap().imported_cards);
    assert_eq!(1, anki.params_of("setDueDate").len());
    assert!(repository.get_last_synced(PROFILE).await.unwrap().is_some());
}

#[tokio::test]
async fn sync_occlusion_mask_removed_suspends_its_anki_card() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let occlusion = create_occlusion(&scope, &["a"]).await;
    scope.save_changes().await.unwrap();
    let anki = anki_with_occlusion(occlusion);
    let mut injector = injector;
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, summary.cards);
    assert_eq!(vec![json!({ "cards": [2] })], anki.params_of("suspend"));
}

#[tokio::test]
async fn sync_occlusion_target_without_a_card_suspends_its_anki_card() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let occlusion = create_occlusion(&scope, &["a", "b"]).await;
    scope.save_changes().await.unwrap();
    let anki = anki_with_occlusion(occlusion);
    let mut injector = injector;
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, summary.cards);
    assert_eq!(vec![json!({ "cards": [2] })], anki.params_of("suspend"));
}

#[tokio::test]
async fn sync_note_moved_while_another_profile_synced_still_moves_in_this_one() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let guid = card_id.hyphenated().to_string();
    let sent = |deck: &str| ExportedNote {
        guid: guid.clone(),
        fingerprint: String::new(),
        version: EXPORT_VERSION,
        deck: deck.to_string(),
        modified: 0,
    };
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .save_exported_note("Another profile", &sent("Amber"))
        .await
        .unwrap();
    repository
        .save_exported_note(PROFILE, &sent("Old folder"))
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": guid } },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    let mut injector = injector;
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(
        vec![json!({ "cards": [1], "deck": "Amber" })],
        anki.params_of("changeDeck")
    );
}

#[tokio::test]
async fn preview_card_in_a_filtered_deck_not_new_until_it_returns() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        filtered_cards: vec![8],
        ..FakeAnki::new(vec![7, 8])
    });
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    assert_eq!(1, preview.decks.len());
    assert_eq!(1, preview.decks[0].new_cards);
}

#[tokio::test]
async fn sync_card_the_importer_skipped_not_new_again() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .times(1)
        .returning(|_, _, _, _, _| Box::pin(async { Ok::<usize, AnkiImportError>(0) }));
    let injector = injector(anki.clone(), import_service).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(vec![choice("Spanish", true)]).await.unwrap();
    let preview = service.preview().await.unwrap();
    service.sync(Vec::new()).await.unwrap();

    // Assert

    assert!(preview.decks.is_empty());
    assert_eq!(1, anki.exported_decks.lock().unwrap().len());
}

#[tokio::test]
async fn sync_linked_card_needs_no_card_info_from_anki() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let link = AnkiCardLink {
        card_id: create_card(&scope).await,
        anki_card_id: AnkiCardId(7),
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links.create(&link).await.unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, summary.cards);
    let card_infos = anki.params_of("cardsInfo");
    assert!(
        card_infos
            .iter()
            .all(|params| params.get("fields").is_some())
    );
}

#[tokio::test]
async fn sync_unchanged_card_not_sent_to_anki_again() {
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        scope.save_changes().await.unwrap();
        card_id
    };
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() } },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    service.sync(Vec::new()).await.unwrap();

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, summary.cards);
    assert_eq!(1, anki.params_of("importPackage").len());
}

#[tokio::test]
async fn sync_card_edited_in_amber_after_it_was_sent_previewed_and_counted_as_an_edit_sent_to_anki()
{
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        scope.save_changes().await.unwrap();
        card_id
    };
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() } },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki);
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    let first = service.sync(Vec::new()).await.unwrap();
    let cards = scope.resolve::<dyn CardRepository>().await;
    cards
        .update_content(card_id, r#"{"edited":true}"#.into(), String::new())
        .await
        .unwrap();
    scope.save_changes().await.unwrap();

    // Act

    let preview = service.preview().await.unwrap();
    let second = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(0, first.sent_edits);
    assert_eq!(1, preview.cards_to_update);
    assert_eq!(1, second.sent_edits);
}

#[tokio::test]
async fn preview_card_deleted_in_anki_after_it_changed_not_counted_as_an_edit_sent_to_anki() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki.clone(), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .replace_paired_cards(PROFILE, &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    let sent = ExportedNote {
        guid: card_id.hyphenated().to_string(),
        fingerprint: String::new(),
        version: EXPORT_VERSION,
        deck: "Amber".into(),
        modified: 0,
    };
    repository.save_exported_note(PROFILE, &sent).await.unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    assert_eq!(1, preview.cards_to_trash);
    assert_eq!(0, preview.cards_to_update);
}

#[tokio::test]
async fn sync_card_sent_with_an_older_export_version_not_counted_as_an_edit_sent_to_anki() {
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        scope.save_changes().await.unwrap();
        card_id
    };
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() } },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki);
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    service.sync(Vec::new()).await.unwrap();
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let mut sent = repository
        .get_exported_notes(PROFILE)
        .await
        .unwrap()
        .remove(0);
    sent.version = EXPORT_VERSION - 1;
    repository.save_exported_note(PROFILE, &sent).await.unwrap();
    scope.save_changes().await.unwrap();

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    let resent = repository
        .get_exported_notes(PROFILE)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(0, preview.cards_to_update);
    assert_eq!(0, summary.sent_edits);
    assert_eq!(EXPORT_VERSION, resent.version);
}

/// A linked card Amber reviewed long ago, due `amber_days` from today, whose last sync saw both apps due
/// `synced_days` from today.
async fn rescheduled_card(
    anki: Arc<FakeAnki>,
    amber_days: i64,
    synced_days: i64,
) -> (Injector, Uuid) {
    let injector = injector(anki, importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
        links
            .create(&AnkiCardLink {
                card_id,
                anki_card_id: AnkiCardId(7),
            })
            .await
            .unwrap();
        let today = anki_date(chrono::Utc::now());
        let review = CardReview {
            due: start_of_day_utc(today + chrono::Duration::days(amber_days)),
            state: CardState::Review,
            scheduled_days: amber_days as u32,
            last_reviewed: Some(chrono::Utc::now() - chrono::Duration::days(30)),
            ..replayed(card_id)
        };
        let reviews = scope.resolve::<dyn CardReviewRepository>().await;
        reviews.upsert(&review).await.unwrap();
        let synced = SyncedSchedule {
            amber_due: Some(today + chrono::Duration::days(synced_days)),
            anki_due: Some(ANKI_TODAY + synced_days),
        };
        let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
        repository
            .replace_paired_cards(
                PROFILE,
                &[pair(card_id, 7)],
                &HashMap::from([(AnkiCardId(7), synced)]),
            )
            .await
            .unwrap();
        scope.save_changes().await.unwrap();
        card_id
    };
    (injector, card_id)
}

#[tokio::test]
async fn sync_due_moved_in_anki_without_a_review_moves_amber_due() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    anki.schedule(7, 9);
    let (injector, card_id) = rescheduled_card(anki.clone(), 5, 5).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let today = anki_date(chrono::Utc::now());
    assert_eq!(
        start_of_day_utc(today + chrono::Duration::days(9)),
        review.due
    );
    assert_eq!(9, review.scheduled_days);
    assert!(anki.params_of("setDueDate").is_empty());
}

#[tokio::test]
async fn sync_due_moved_in_amber_without_a_review_moves_anki_due() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    anki.schedule(7, 5);
    let (injector, _) = rescheduled_card(anki.clone(), 8, 5).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    let due_dates = anki.params_of("setDueDate");
    assert_eq!(1, due_dates.len());
    assert_eq!(json!("8!"), due_dates[0]["days"]);
}

#[tokio::test]
async fn sync_due_moved_in_amber_for_a_card_suspended_in_anki_suspends_it_again() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        suspended_cards: vec![7],
        ..FakeAnki::new(vec![7])
    });
    anki.schedule(7, 5);
    let (injector, _) = rescheduled_card(anki.clone(), 8, 5).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, anki.params_of("setDueDate").len());
    assert_eq!(vec![json!({ "cards": [7] })], anki.params_of("suspend"));
}

#[tokio::test]
async fn sync_after_moving_a_due_date_records_both_apps_agreeing() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    anki.schedule(7, 5);
    let (injector, _) = rescheduled_card(anki.clone(), 8, 5).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(Vec::new()).await.unwrap();
    service.sync(Vec::new()).await.unwrap();

    // Assert

    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let synced = repository.get_synced_schedules(PROFILE).await.unwrap();
    let today = anki_date(chrono::Utc::now());
    let expected = SyncedSchedule {
        amber_due: Some(today + chrono::Duration::days(8)),
        anki_due: Some(ANKI_TODAY + 8),
    };
    assert_eq!(Some(&expected), synced.get(&AnkiCardId(7)));
    assert_eq!(1, anki.params_of("setDueDate").len());
}

/// What Amber changed on a card after sending it to Anki.
#[derive(Clone, Copy, PartialEq)]
enum AmberChange {
    Nothing,
    Content,
    Tags,
}

/// An Amber card sent to Anki as note 100 at second 1000, which Anki then edited at `anki_modified`.
async fn card_edited_in_anki(amber_change: AmberChange, anki_modified: i64) -> (Injector, Uuid) {
    let front = "<b>Edited</b> <img src=\"cat.png\">";
    card_with_anki_sides(amber_change, anki_modified, [front, "Back"]).await
}

/// An Amber card sent to Anki as note 100 at second 1000, whose note Anki changed at `anki_modified` and
/// now holds `sides` in.
async fn card_with_anki_sides(
    amber_change: AmberChange,
    anki_modified: i64,
    sides: [&str; 2],
) -> (Injector, Uuid) {
    let card_id = Uuid::new_v4();
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "modelName": "Amber Basic",
            "mod": anki_modified,
            "fields": {
                "Front": { "value": sides[0] },
                "Back": { "value": sides[1] },
                AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() },
            },
            "cards": [1],
        })],
        amber_cards: vec![(1, 100, 0)],
        media: HashMap::from([("cat.png".to_string(), b"\x89PNG image".to_vec())]),
        ..FakeAnki::new(Vec::new())
    });
    let injector = injector(anki, importing_nothing()).await;
    {
        let scope = injector.start_scope();
        create_card_with_id(&scope, card_id).await;
        let cards = scope.resolve::<dyn CardRepository>().await;
        let card = cards.get_by_id(card_id).await.unwrap();
        let note = basic_note(
            &card,
            card.front.clone(),
            card.back.clone(),
            String::new(),
            Vec::new(),
        );
        let sent = ExportedNote {
            guid: card_id.hyphenated().to_string(),
            fingerprint: fingerprint(&note),
            version: EXPORT_VERSION,
            deck: "Amber".into(),
            modified: 1_000,
        };
        let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
        repository.save_exported_note(PROFILE, &sent).await.unwrap();
        match amber_change {
            AmberChange::Nothing => {}
            AmberChange::Content => {
                let edit = r#"{"amber":"edit"}"#.to_string();
                cards
                    .update_content(card_id, edit, String::new())
                    .await
                    .unwrap();
            }
            AmberChange::Tags => {
                let metas = scope.resolve::<dyn MetaRepository>().await;
                let tags = vec!["verbs".to_string()];
                metas
                    .update_tags(ElementId::Card(card_id), tags)
                    .await
                    .unwrap();
            }
        }
        scope.save_changes().await.unwrap();
    }
    (injector, card_id)
}

async fn synced_front(injector: &Injector, card_id: Uuid) -> (Vec<Uuid>, String) {
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    let summary = service.sync(Vec::new()).await.unwrap();
    let cards = scope.resolve::<dyn CardRepository>().await;
    let card = cards.get_by_id(card_id).await.unwrap();
    scope.save_changes().await.unwrap();
    (summary.edited_cards, card.front)
}

#[tokio::test]
async fn sync_amber_card_edited_only_in_anki_takes_the_edit_with_its_images() {
    // Arrange

    let (injector, card_id) = card_edited_in_anki(AmberChange::Nothing, 2_000).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert_eq!(vec![card_id], edited);
    assert!(front.contains("<b>Edited</b>"));
    assert!(front.contains("data:image/png;base64,"));
}

#[tokio::test]
async fn sync_anki_edit_to_a_card_with_math_keeps_its_equations() {
    // Arrange

    let front = r"<p><span>\(x^2\)</span> squared</p>";
    let (injector, card_id) =
        card_with_anki_sides(AmberChange::Nothing, 2_000, [front, "Back"]).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert_eq!(vec![card_id], edited);
    assert!(front.contains("data-lexical-equation"));
    assert!(!front.contains(r"\\("));
}

#[tokio::test]
async fn sync_note_changed_in_anki_holding_the_sides_amber_sent_leaves_the_card_as_it_was() {
    // Arrange

    let (injector, card_id) = card_with_anki_sides(AmberChange::Nothing, 2_000, ["", ""]).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert!(edited.is_empty());
    assert_eq!("", front);
    assert_eq!(0, previewed(&injector).await.cards_edited_in_anki);
}

#[tokio::test]
async fn sync_card_edited_in_anki_then_in_amber_keeps_amber_edit() {
    // Arrange

    let (injector, card_id) = card_edited_in_anki(AmberChange::Content, 2_000).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert!(edited.is_empty());
    assert_eq!(r#"{"amber":"edit"}"#, front);
}

#[tokio::test]
async fn sync_card_edited_in_amber_then_in_anki_takes_anki_edit() {
    // Arrange

    let later = (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp();
    let (injector, card_id) = card_edited_in_anki(AmberChange::Content, later).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert_eq!(vec![card_id], edited);
    assert!(front.contains("<b>Edited</b>"));
}

#[tokio::test]
async fn sync_card_retagged_in_amber_and_edited_in_anki_takes_anki_edit() {
    // Arrange

    let (injector, card_id) = card_edited_in_anki(AmberChange::Tags, 2_000).await;

    // Act

    let (edited, front) = synced_front(&injector, card_id).await;

    // Assert

    assert_eq!(vec![card_id], edited);
    assert!(front.contains("<b>Edited</b>"));
}

#[tokio::test]
async fn sync_anki_edit_that_leaves_the_card_as_it_was_not_taken_again() {
    // Arrange

    let later = (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp();
    let (injector, card_id) = card_edited_in_anki(AmberChange::Nothing, later).await;
    synced_front(&injector, card_id).await;

    // Act

    let (edited, _) = synced_front(&injector, card_id).await;

    // Assert

    assert!(edited.is_empty());
    assert_eq!(0, previewed(&injector).await.cards_edited_in_anki);
}

async fn previewed(injector: &Injector) -> AnkiSyncPreview {
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    service.preview().await.unwrap()
}

#[tokio::test]
async fn preview_amber_card_edited_only_in_anki_counted_as_an_edit_coming_to_amber() {
    // Arrange

    let (injector, _) = card_edited_in_anki(AmberChange::Nothing, 2_000).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(1, preview.cards_edited_in_anki);
    assert_eq!(0, preview.cards_to_update);
}

#[tokio::test]
async fn preview_card_edited_in_anki_then_in_amber_counted_as_an_edit_sent_to_anki() {
    // Arrange

    let (injector, _) = card_edited_in_anki(AmberChange::Content, 2_000).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(0, preview.cards_edited_in_anki);
    assert_eq!(1, preview.cards_to_update);
}

#[tokio::test]
async fn is_synced_import_card_imported_from_a_package_counts_only_once_a_sync_pairs_it() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;

    // Act

    let imported = repository.is_synced_import(card_id).await.unwrap();
    repository
        .replace_paired_cards(PROFILE, &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    let paired = repository.is_synced_import(card_id).await.unwrap();

    // Assert

    assert!(!imported);
    assert!(paired);
}

#[tokio::test]
async fn is_synced_import_card_paired_on_another_device_counts_without_a_local_pair() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .replace_paired_cards(PROFILE, &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    let tx = scope.resolve::<DbTransaction>().await;
    sqlx::query("DELETE FROM anki_paired_cards")
        .execute(tx.lock().await.as_mut())
        .await
        .unwrap();

    // Act

    let synced = repository.is_synced_import(card_id).await.unwrap();

    // Assert

    assert!(synced);
}

#[tokio::test]
async fn preview_card_outside_any_folder_listed_as_sent_to_the_amber_deck() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    create_card(&scope).await;
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    let expected = vec![AnkiSendingDeck {
        name: "Amber".into(),
        new_cards: 1,
    }];
    assert_eq!(expected, preview.sending_decks);
}

#[tokio::test]
async fn preview_card_missing_its_content_not_listed_as_sent_to_anki() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    {
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        sqlx::query("DELETE FROM cards WHERE id = ?1")
            .bind(card_id.hyphenated().to_string())
            .execute(guard.as_mut())
            .await
            .unwrap();
    }
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    assert!(preview.sending_decks.is_empty());
}

#[tokio::test]
async fn preview_folder_made_in_amber_sent_under_the_amber_deck_and_imported_one_to_its_deck() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let creation = scope.resolve::<dyn ElementCreationService>().await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    for (name, from_anki) in [("Biology", false), ("Spanish", true)] {
        let id = Uuid::new_v4();
        creation
            .create_folder(CreateFolderDto {
                id,
                meta: CreateMetaDto {
                    name: Some(name.to_string()),
                    parent: None,
                    origin: Origin::Custom {
                        derived_from: None,
                        bibliographical_source_id: None,
                    },
                },
            })
            .await
            .unwrap();
        if from_anki {
            links.set_folder_anki_deck(id, name).await.unwrap();
        }
        let card_id = create_card(&scope).await;
        let metas = scope.resolve::<dyn MetaRepository>().await;
        let position = fractional_index::FractionalIndex::default();
        metas
            .move_to(
                ElementId::Card(card_id),
                Some(ElementId::Folder(id)),
                position,
            )
            .await
            .unwrap();
    }
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    let decks: Vec<&str> = preview
        .sending_decks
        .iter()
        .map(|d| d.name.as_str())
        .collect();
    assert_eq!(vec!["Amber::Biology", "Spanish"], decks);
}

/// A folder named `name` in `parent`, made from the Anki deck `deck` when one is given.
async fn create_folder_in(
    scope: &injector::injector_scope::InjectorScope<'_>,
    name: &str,
    parent: Option<Uuid>,
    deck: Option<&str>,
) -> Uuid {
    let id = Uuid::new_v4();
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_folder(CreateFolderDto {
            id,
            meta: CreateMetaDto {
                name: Some(name.to_string()),
                parent: parent.map(ElementId::Folder),
                origin: Origin::Custom {
                    derived_from: None,
                    bibliographical_source_id: None,
                },
            },
        })
        .await
        .unwrap();
    if let Some(deck) = deck {
        let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
        links.set_folder_anki_deck(id, deck).await.unwrap();
    }
    id
}

/// `Anki > Grammar > Verbs`, the Verbs subdeck moved out of `Anki > Spanish`, both made from Anki decks.
async fn subdeck_moved_out_of_its_deck(
    scope: &injector::injector_scope::InjectorScope<'_>,
) -> (Uuid, Uuid) {
    let anki = create_folder_in(scope, "Anki", None, None).await;
    let grammar = create_folder_in(scope, "Grammar", Some(anki), None).await;
    let spanish = create_folder_in(scope, "Spanish", Some(anki), Some("Spanish")).await;
    let verbs = create_folder_in(scope, "Verbs", Some(grammar), Some("Spanish::Verbs")).await;
    (spanish, verbs)
}

#[tokio::test]
async fn preview_card_made_in_amber_in_a_subdeck_moved_out_of_its_deck_sent_to_that_subdeck() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    let (_, verbs) = subdeck_moved_out_of_its_deck(&scope).await;
    let card_id = create_card(&scope).await;
    let metas = scope.resolve::<dyn MetaRepository>().await;
    metas
        .move_to(
            ElementId::Card(card_id),
            Some(ElementId::Folder(verbs)),
            fractional_index::FractionalIndex::default(),
        )
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    let decks: Vec<&str> = preview
        .sending_decks
        .iter()
        .map(|d| d.name.as_str())
        .collect();
    assert_eq!(vec!["Spanish::Verbs"], decks);
}

#[tokio::test]
async fn sync_new_cards_of_a_subdeck_moved_out_of_its_deck_imported_into_its_folder() {
    // Arrange

    let offered = Arc::new(Mutex::new(HashMap::new()));
    let recorded = offered.clone();
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(move |_, _, folders, _, _| {
            *recorded.lock().unwrap() = folders;
            Box::pin(async { Ok::<usize, AnkiImportError>(1) })
        });
    let injector = injector(FakeAnki::holding(vec![7]), import_service).await;
    let scope = injector.start_scope();
    let (spanish, verbs) = subdeck_moved_out_of_its_deck(&scope).await;
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(vec![choice("Spanish", true)]).await.unwrap();

    // Assert

    let offered = offered.lock().unwrap();
    let path = |deck: &str| deck.split("::").map(str::to_string).collect::<Vec<_>>();
    assert_eq!(
        Some(&ElementId::Folder(spanish)),
        offered.get(&path("Spanish"))
    );
    assert_eq!(
        Some(&ElementId::Folder(verbs)),
        offered.get(&path("Spanish::Verbs"))
    );
}

fn log_at(second: i64) -> CardReviewLog {
    CardReviewLog {
        id: Uuid::new_v4(),
        card_id: None,
        reviewed_at: DateTime::from_timestamp(second, 0).unwrap(),
        rating: Rating::Good,
        duration_ms: None,
    }
}

#[test]
fn all_newer_than_amber_pulled_after_every_amber_review_returns_true() {
    // Arrange

    let amber = [log_at(100), log_at(200)];
    let pulled = [log_at(300)];

    // Act

    let actual = all_newer_than_amber(&pulled, &amber, DateTime::from_timestamp(250, 0));

    // Assert

    assert!(actual);
}

#[test]
fn all_newer_than_amber_pulled_before_last_review_returns_false() {
    // Arrange

    let pulled = [log_at(300), log_at(150)];

    // Act

    let older_than_log = all_newer_than_amber(&pulled, &[log_at(200)], None);
    let older_than_schedule =
        all_newer_than_amber(&[log_at(300)], &[], DateTime::from_timestamp(400, 0));

    // Assert

    assert!(!older_than_log);
    assert!(!older_than_schedule);
}

/// Anki's note 50 of the imported `card`, edited after the last sync.
fn edited_imported_note() -> Value {
    json!({
        "noteId": 50,
        "fields": { "Front": { "value": "hola", "order": 0 }, "Back": { "value": "hello", "order": 1 } },
        "cards": [7],
        "mod": chrono::Utc::now().timestamp() + 60,
    })
}

/// An Amber card imported from Anki card 7, whose note Anki edited after the last sync.
async fn imported_card_edited_in_anki(
    previous_hash: Option<String>,
    is_occlusion: bool,
) -> Injector {
    imported_card_with_note(edited_imported_note(), previous_hash, is_occlusion).await
}

/// The imported note as edited on another device a day ago, before the last sync, and only now in Anki.
fn note_edited_before_the_last_sync() -> Value {
    let mut note = edited_imported_note();
    note["mod"] = json!(chrono::Utc::now().timestamp() - 86_400);
    note
}

/// An Amber card imported from Anki card 7, synced an hour ago, whose note Anki lists as edited lately.
async fn imported_card_with_note(
    note: Value,
    previous_hash: Option<String>,
    is_occlusion: bool,
) -> Injector {
    let anki = Arc::new(FakeAnki {
        edited_notes: vec![note],
        ..FakeAnki::new(vec![7])
    });
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = if is_occlusion {
        create_occlusion(&scope, &["a"]).await;
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        repository.get_all_links().await.unwrap()[0].card_id
    } else {
        create_card(&scope).await
    };
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let synced = chrono::Utc::now() - chrono::Duration::hours(1);
    repository.set_last_synced(PROFILE, synced).await.unwrap();
    if let Some(hash) = previous_hash {
        let hashes = [(AnkiNoteId(50), hash)];
        repository
            .save_imported_note_hashes(PROFILE, &hashes)
            .await
            .unwrap();
    }
    scope.save_changes().await.unwrap();
    injector
}

#[tokio::test]
async fn preview_imported_card_whose_fields_changed_in_anki_counted_as_an_edit_coming_to_amber() {
    // Arrange

    let injector = imported_card_edited_in_anki(Some("older".into()), false).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(1, preview.cards_edited_in_anki);
}

#[tokio::test]
async fn preview_imported_card_edited_before_the_last_sync_but_arriving_after_it_counted_as_an_edit()
 {
    // Arrange

    let note = note_edited_before_the_last_sync();
    let injector = imported_card_with_note(note, Some("older".into()), false).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(1, preview.cards_edited_in_anki);
}

#[tokio::test]
async fn preview_imported_card_without_a_hash_changed_before_the_last_sync_not_counted_as_an_edit()
{
    // Arrange

    let note = note_edited_before_the_last_sync();
    let injector = imported_card_with_note(note, None, false).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(0, preview.cards_edited_in_anki);
}

#[tokio::test]
async fn preview_imported_card_retagged_in_anki_not_counted_as_an_edit_coming_to_amber() {
    // Arrange

    let note: AnkiNoteInfo = serde_json::from_value(edited_imported_note()).unwrap();
    let injector = imported_card_edited_in_anki(Some(super::plan::fields_hash(&note)), false).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(0, preview.cards_edited_in_anki);
}

#[tokio::test]
async fn preview_imported_occlusion_edited_in_anki_not_counted_as_an_edit_coming_to_amber() {
    // Arrange

    let injector = imported_card_edited_in_anki(None, true).await;

    // Act

    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(0, preview.cards_edited_in_anki);
}

#[tokio::test]
async fn preview_reviews_either_app_lacks_counted_as_the_sync_merges_them() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        reviews: json!({ "7": [
            { "id": 5_000_000_000_i64, "ease": 3, "time": 1000, "ivl": 12, "type": 1 },
            { "id": 6_000_000_000_i64, "ease": 3, "time": 1000, "ivl": 30, "type": 1 },
        ] }),
        ..FakeAnki::new(vec![7])
    });
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(2, preview.reviews_to_amber);
    assert_eq!(0, preview.reviews_to_anki);
    assert_eq!(summary.pulled_reviews, preview.reviews_to_amber);
    assert_eq!(summary.pushed_reviews, preview.reviews_to_anki);
}

/// An Amber card paired with Anki card 7, which both apps reviewed Good at `good_at` and Amber then
/// answered Again, leaving it relearning.
async fn card_answered_again_in_amber(anki: Arc<FakeAnki>, good_at: i64) -> (Injector, Uuid) {
    let injector = injector(anki, importing_nothing()).await;
    let card_id = answer_again_in_amber(&injector, good_at).await;
    (injector, card_id)
}

/// A card paired with Anki's card 7, answered Good at `good_at` and Again 55 minutes later in Amber.
async fn answer_again_in_amber(injector: &Injector, good_at: i64) -> Uuid {
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    links
        .create(&AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        })
        .await
        .unwrap();
    let now = chrono::Utc::now();
    let logs = scope.resolve::<dyn CardReviewLogRepository>().await;
    for (reviewed_at, rating) in [(good_at, Rating::Good), (good_at + 3_300, Rating::Again)] {
        let log = CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at: DateTime::from_timestamp(reviewed_at, 0).unwrap(),
            rating,
            duration_ms: Some(1000),
        };
        logs.create(&log).await.unwrap();
    }
    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = CardReview {
        due: now + chrono::Duration::minutes(5),
        state: CardState::Relearning,
        last_reviewed: DateTime::from_timestamp(good_at + 3_300, 0),
        ..replayed(card_id)
    };
    reviews.upsert(&review).await.unwrap();
    scope.save_changes().await.unwrap();
    card_id
}

/// When both apps reviewed card 7 Good, in Unix seconds.
fn an_hour_ago() -> i64 {
    (chrono::Utc::now() - chrono::Duration::hours(1)).timestamp()
}

/// Anki holding card 7 as a review card with the Good review at `good_at`.
fn anki_reviewed_at(good_at: i64) -> FakeAnki {
    let anki = FakeAnki {
        reviews: json!({ "7": [{ "id": good_at * 1000, "ease": 3, "time": 1000, "ivl": 3, "type": 1 }] }),
        ..FakeAnki::new(vec![7])
    };
    anki.schedule(7, 3);
    anki
}

#[tokio::test]
async fn sync_card_answered_again_in_amber_answers_it_again_in_anki_and_matches_that_answer() {
    // Arrange

    let good_at = an_hour_ago();
    let anki = Arc::new(anki_reviewed_at(good_at));
    let (injector, _) = card_answered_again_in_amber(anki.clone(), good_at).await;

    // Act

    let first = {
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AnkiSyncService>().await;
        service.sync(Vec::new()).await.unwrap()
    };
    let preview = previewed(&injector).await;
    let second = {
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AnkiSyncService>().await;
        service.sync(Vec::new()).await.unwrap()
    };

    // Assert

    assert_eq!(1, first.pushed_reviews);
    assert_eq!(1, anki.answered.lock().unwrap().len());
    assert!(anki.params_of("insertReviews").is_empty());
    assert!(anki.params_of("setDueDate").is_empty());
    assert_eq!((0, 0), (preview.reviews_to_anki, preview.reviews_to_amber));
    assert_eq!((0, 0), (second.pushed_reviews, second.pulled_reviews));
}

#[tokio::test]
async fn sync_card_anki_refuses_to_answer_logs_amber_again_review_and_schedule() {
    // Arrange

    let good_at = an_hour_ago();
    let anki = Arc::new(FakeAnki {
        refuses_answers: true,
        ..anki_reviewed_at(good_at)
    });
    let (injector, _) = card_answered_again_in_amber(anki.clone(), good_at).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, summary.pushed_reviews);
    assert!(anki.answered.lock().unwrap().is_empty());
    let inserted = anki.params_of("insertReviews");
    assert_eq!(1, inserted[0]["reviews"].as_array().unwrap().len());
    assert_eq!(json!(1), inserted[0]["reviews"][0][3]);
    assert_eq!(1, anki.params_of("setDueDate").len());
}

#[tokio::test]
async fn preview_due_moved_in_anki_without_a_review_counted_as_the_sync_carries_it() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    anki.schedule(7, 9);
    let (injector, _) = rescheduled_card(anki.clone(), 5, 5).await;

    // Act

    let preview = previewed(&injector).await;
    let summary = {
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AnkiSyncService>().await;
        service.sync(Vec::new()).await.unwrap()
    };

    // Assert

    assert_eq!(
        (0, 1),
        (preview.due_dates_to_anki, preview.due_dates_to_amber)
    );
    assert_eq!(
        (0, 1),
        (summary.due_dates_to_anki, summary.due_dates_to_amber)
    );
}

/// Moves the card's due date `days` from today in Amber without a review, as the study view does.
async fn move_amber_due(injector: &Injector, card_id: Uuid, days: i64) {
    let scope = injector.start_scope();
    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let mut review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let today = anki_date(chrono::Utc::now());
    review.due = start_of_day_utc(today + chrono::Duration::days(days));
    review.scheduled_days = days as u32;
    reviews.upsert(&review).await.unwrap();
    scope.save_changes().await.unwrap();
}

#[tokio::test]
async fn sync_anki_reviewed_then_due_moved_in_amber_keeps_amber_due_in_both_apps() {
    // Arrange

    let anki = Arc::new(anki_reviewed_at(an_hour_ago()));
    let (injector, card_id) = rescheduled_card(anki.clone(), 5, 5).await;
    move_amber_due(&injector, card_id, 8).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let today = anki_date(chrono::Utc::now());
    assert_eq!(
        start_of_day_utc(today + chrono::Duration::days(8)),
        review.due
    );
    assert_eq!(5.0, review.stability);
    let due_dates = anki.params_of("setDueDate");
    assert_eq!(1, due_dates.len());
    assert_eq!(json!("8!"), due_dates[0]["days"]);
    assert_eq!((1, 1), (summary.pulled_reviews, summary.due_dates_to_anki));
}

#[tokio::test]
async fn sync_due_moved_in_amber_then_anki_reviewed_takes_anki_review() {
    // Arrange

    let anki = Arc::new(anki_reviewed_at(chrono::Utc::now().timestamp() + 5));
    let (injector, card_id) = rescheduled_card(anki.clone(), 5, 5).await;
    move_amber_due(&injector, card_id, 8).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    let reviews = scope.resolve::<dyn CardReviewRepository>().await;
    let review = reviews.get_by_card_id(card_id).await.unwrap().unwrap();
    let today = anki_date(chrono::Utc::now());
    assert_eq!(
        start_of_day_utc(today + chrono::Duration::days(3)),
        review.due
    );
    assert!(anki.params_of("setDueDate").is_empty());
    assert_eq!(0, summary.due_dates_to_anki);
}

/// The `setSpecificValueOfCard` keys Anki was sent for each card.
fn values_set(anki: &FakeAnki) -> Vec<(i64, Vec<String>)> {
    let multis = anki.params_of("multi");
    let actions = multis
        .iter()
        .flat_map(|multi| multi["actions"].as_array().unwrap().clone());
    actions
        .filter(|action| action["action"] == "setSpecificValueOfCard")
        .map(|action| {
            let keys = action["params"]["keys"].as_array().unwrap();
            let keys = keys.iter().map(|key| key.as_str().unwrap().to_string());
            (action["params"]["card"].as_i64().unwrap(), keys.collect())
        })
        .collect()
}

#[tokio::test]
async fn sync_amber_review_logged_while_anki_reviewed_last_gives_anki_amber_counts() {
    // Arrange

    let reviewed_at = an_hour_ago();
    let anki = Arc::new(anki_reviewed_at(reviewed_at));
    let (injector, card_id) = rescheduled_card(anki.clone(), 5, 5).await;
    {
        let scope = injector.start_scope();
        let logs = scope.resolve::<dyn CardReviewLogRepository>().await;
        let log = CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at: DateTime::from_timestamp(reviewed_at - 60, 0).unwrap(),
            rating: Rating::Good,
            duration_ms: Some(1000),
        };
        logs.create(&log).await.unwrap();
        scope.save_changes().await.unwrap();
    }
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!((1, 1), (summary.pushed_reviews, summary.pulled_reviews));
    assert!(anki.params_of("setDueDate").is_empty());
    let expected = vec![(7, vec!["reps".to_string(), "lapses".to_string()])];
    assert_eq!(expected, values_set(&anki));
}

#[tokio::test]
async fn sync_new_card_good_in_amber_still_learning_answered_good_in_anki() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);
    let injector = injector(anki.clone(), importing_nothing()).await;
    {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
        links
            .create(&AnkiCardLink {
                card_id,
                anki_card_id: AnkiCardId(7),
            })
            .await
            .unwrap();
        let reviewed_at = chrono::Utc::now() - chrono::Duration::minutes(2);
        let logs = scope.resolve::<dyn CardReviewLogRepository>().await;
        let log = CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at,
            rating: Rating::Good,
            duration_ms: Some(1000),
        };
        logs.create(&log).await.unwrap();
        let reviews = scope.resolve::<dyn CardReviewRepository>().await;
        let review = CardReview {
            due: reviewed_at + chrono::Duration::minutes(10),
            state: CardState::Learning,
            last_reviewed: Some(reviewed_at),
            ..replayed(card_id)
        };
        reviews.upsert(&review).await.unwrap();
        scope.save_changes().await.unwrap();
    }

    // Act

    let first = {
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AnkiSyncService>().await;
        service.sync(Vec::new()).await.unwrap()
    };
    let preview = previewed(&injector).await;

    // Assert

    assert_eq!(1, first.pushed_reviews);
    let answered: Vec<(i64, i64)> = anki
        .answered
        .lock()
        .unwrap()
        .iter()
        .map(|(card, _, ease)| (*card, *ease))
        .collect();
    assert_eq!(vec![(7, 3)], answered);
    assert!(anki.params_of("insertReviews").is_empty());
    assert!(anki.params_of("setDueDate").is_empty());
    assert_eq!((0, 0), (preview.reviews_to_anki, preview.reviews_to_amber));
}

#[tokio::test]
async fn sync_deck_imported_records_its_notes_fields_hashes() {
    // Arrange

    let note = json!({
        "noteId": 7,
        "fields": { "Front": { "value": "hola", "order": 0 }, "Back": { "value": "hello", "order": 1 } },
        "cards": [7],
    });
    let anki = Arc::new(FakeAnki {
        edited_notes: vec![note.clone()],
        ..FakeAnki::new(vec![7])
    });
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(|_, _, _, _, _| Box::pin(async { Ok::<usize, AnkiImportError>(1) }));
    let injector = injector(anki, import_service).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    service.sync(vec![choice("Spanish", true)]).await.unwrap();

    // Assert

    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let hashes = repository
        .get_imported_note_hashes(PROFILE, &[AnkiNoteId(7)])
        .await
        .unwrap();
    let info: AnkiNoteInfo = serde_json::from_value(note).unwrap();
    assert_eq!(
        Some(&super::plan::fields_hash(&info)),
        hashes.get(&AnkiNoteId(7))
    );
}

#[tokio::test]
async fn sync_new_card_previewed_and_counted_as_sent_to_anki() {
    // Arrange

    let injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let scope = injector.start_scope();
    create_card(&scope).await;
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, preview.sending_decks[0].new_cards);
    assert_eq!(1, summary.sent_cards);
}

#[tokio::test]
async fn preview_card_deleted_in_anki_not_listed_as_sent_to_anki() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    let card_id = create_card(&scope).await;
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    repository
        .replace_paired_cards(PROFILE, &[pair(card_id, 7)], &HashMap::new())
        .await
        .unwrap();
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();

    // Assert

    assert_eq!(1, preview.cards_to_trash);
    assert!(preview.sending_decks.is_empty());
}

#[tokio::test]
async fn sync_unpaired_card_whose_note_anki_holds_not_counted_as_new() {
    // Arrange

    let card_id = Uuid::new_v4();
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![json!({
            "noteId": 100,
            "fields": { AMBER_ID_FIELD: { "value": card_id.hyphenated().to_string() } },
            "cards": [7],
        })],
        amber_cards: vec![(7, 100, 0)],
        ..FakeAnki::new(Vec::new())
    });
    let injector = injector(anki, importing_nothing()).await;
    let scope = injector.start_scope();
    create_card_with_id(&scope, card_id).await;
    scope.save_changes().await.unwrap();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert!(preview.sending_decks.is_empty());
    assert_eq!(0, summary.sent_cards);
}

#[tokio::test]
async fn sync_amber_occlusion_edited_in_anki_sends_amber_version_over_the_edit() {
    // Arrange

    let mut injector = injector(FakeAnki::holding(Vec::new()), importing_nothing()).await;
    let occlusion = {
        let scope = injector.start_scope();
        let occlusion = create_occlusion(&scope, &["a", "b"]).await;
        scope.save_changes().await.unwrap();
        occlusion
    };
    injector.register_singleton::<dyn AnkiConnectClient>(anki_with_occlusion(occlusion));
    {
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AnkiSyncService>().await;
        service.sync(Vec::new()).await.unwrap();
    }
    let edited_at = chrono::Utc::now().timestamp() + 1_000;
    let anki = anki_with_occlusion(occlusion);
    let mut note = anki.amber_notes[0].clone();
    note["modelName"] = json!("Amber Image Occlusion");
    note["mod"] = json!(edited_at);
    let anki = Arc::new(FakeAnki {
        amber_notes: vec![note],
        amber_cards: anki.amber_cards.clone(),
        ..FakeAnki::new(Vec::new())
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki.clone());
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert_eq!(1, preview.cards_to_update);
    assert_eq!(1, summary.sent_edits);
    assert_eq!(1, anki.params_of("importPackage").len());
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let sent = repository.get_exported_notes(PROFILE).await.unwrap();
    let record = sent
        .iter()
        .find(|note| note.guid == occlusion.hyphenated().to_string())
        .unwrap();
    assert!(record.modified > edited_at);
}

/// Builds occlusion cards' content as the frontend would, without one.
struct FakeOcclusionContent;

#[async_trait]
impl crate::image_occlusion::services::occlusion_card_content_builder::OcclusionCardContentBuilder
    for FakeOcclusionContent
{
    async fn build(
        &self,
        _occlusion: &ImageOcclusion,
        target_keys: &[String],
    ) -> Result<
        HashMap<String, crate::image_occlusion::value_objects::occlusion_card_content::OcclusionCardContent>,
        crate::image_occlusion::services::occlusion_card_content_builder::OcclusionCardContentBuilderError,
    >{
        Ok(target_keys
            .iter()
            .map(|key| {
                let content = crate::image_occlusion::value_objects::occlusion_card_content::OcclusionCardContent {
                    front: format!("front {key}"),
                    back: format!("back {key}"),
                };
                (key.clone(), content)
            })
            .collect())
    }
}

/// A native Image Occlusion note 300 in deck `Anatomy` quizzing `masks` (one per card, cards 1, 2, …).
fn native_occlusion_package(image: &[u8], masks: usize) -> Vec<u8> {
    let models = json!({
        "30": {
            "name": "Image Occlusion", "type": 1,
            "flds": [
                {"name": "Occlusion", "ord": 0}, {"name": "Image", "ord": 1},
                {"name": "Header", "ord": 2}, {"name": "Back Extra", "ord": 3}
            ],
            "tmpls": [{
                "name": "Image Occlusion", "ord": 0,
                "qfmt": "<div style=\"display: none\">{{cloze:Occlusion}}</div><div id=\"image-occlusion-container\">{{Image}}</div>",
                "afmt": "{{cloze:Occlusion}}{{Image}}"
            }]
        }
    });
    let decks = json!({"1": {"name": "Anatomy"}});
    let occlusion: String = (1..=masks)
        .map(|i| {
            let left = 0.1 * i as f64;
            format!(
                "{{{{c{i}::image-occlusion:rect:left={left:.1}:top=.2:width=.1:height=.1:oi=1}}}}"
            )
        })
        .collect();
    let mut rows = format!(
        "INSERT INTO notes VALUES (300, 30, '', '{occlusion}\x1f<img src=\"heart.png\">\x1f<b>Heart</b>\x1f');"
    );
    for i in 1..=masks {
        rows.push_str(&format!(
            "INSERT INTO cards VALUES ({i}, 300, 1, {}, 0);",
            i - 1
        ));
    }
    let collection = crate::import::anki::fixtures::build_legacy_collection(&models, &decks, &rows);
    crate::import::anki::fixtures::build_package(&[
        ("collection.anki2", &collection),
        ("media", br#"{"0": "heart.png"}"#),
        ("0", image),
    ])
}

/// Anki's note 300 as `notesInfo` gives it after an edit in Anki, holding `masks` cards.
fn native_occlusion_note(masks: i64) -> Value {
    json!({
        "noteId": 300,
        "fields": {
            "Occlusion": { "value": "{{c1::image-occlusion:rect:left=.1:top=.2:width=.1:height=.1:oi=1}}", "order": 0 },
            "Image": { "value": "<img src=\"heart.png\">", "order": 1 },
        },
        "cards": (1..=masks).collect::<Vec<i64>>(),
        "mod": chrono::Utc::now().timestamp() + 60,
    })
}

/// An Amber occlusion imported from note 300 with two masks, each card linked to its Anki card, last
/// synced an hour ago; Anki now holds the note with three masks.
async fn imported_occlusion_given_a_mask_in_anki() -> (Injector, Arc<FakeAnki>, Uuid) {
    let image = crate::import::anki::fixtures::png(40, 20);
    let anki = Arc::new(FakeAnki {
        edited_notes: vec![native_occlusion_note(3)],
        package: native_occlusion_package(&image, 3),
        ..FakeAnki::new(vec![1, 2, 3])
    });
    let mut injector = injector(anki.clone(), importing_nothing()).await;
    injector.register_singleton::<dyn crate::image_occlusion::services::occlusion_card_content_builder::OcclusionCardContentBuilder>(
        Arc::new(FakeOcclusionContent),
    );
    let scope = injector.start_scope();
    let wanted = HashSet::from([AnkiCardId(1), AnkiCardId(2)]);
    let extraction = crate::import::anki::extraction::extract_anki_cards(
        native_occlusion_package(&image, 2),
        &wanted,
    )
    .unwrap();
    let imported = extraction
        .decks
        .into_iter()
        .next()
        .unwrap()
        .image_occlusions
        .remove(0);
    let id = Uuid::new_v4();
    scope
        .resolve::<dyn crate::image_occlusion::services::image_occlusion_service::ImageOcclusionService>()
        .await
        .create(crate::image_occlusion::dto::create_image_occlusion_dto::CreateImageOcclusionDto {
            id,
            meta: CreateMetaDto {
                name: Some(imported.name.clone()),
                parent: None,
                origin: Origin::Custom {
                    derived_from: None,
                    bibliographical_source_id: None,
                },
            },
            image_asset_id: imported.image_asset_id.clone(),
            image_width: imported.image_width,
            image_height: imported.image_height,
            shapes: imported.shapes.clone(),
            mode: imported.mode,
        })
        .await
        .unwrap();
    let anki_cards: HashMap<String, AnkiCardId> = imported.anki_cards.iter().cloned().collect();
    let occlusions = scope.resolve::<dyn ImageOcclusionRepository>().await;
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    for link in occlusions.get_links(id).await.unwrap() {
        let anki_card_id = anki_cards[&link.target_key];
        links
            .create(&AnkiCardLink {
                card_id: link.card_id,
                anki_card_id,
            })
            .await
            .unwrap();
    }
    let repository = scope.resolve::<dyn AnkiSyncRepository>().await;
    let synced = chrono::Utc::now() - chrono::Duration::hours(1);
    repository.set_last_synced(PROFILE, synced).await.unwrap();
    scope.save_changes().await.unwrap();
    (injector, anki, id)
}

#[tokio::test]
async fn sync_mask_added_in_anki_to_imported_occlusion_gives_it_a_card_paired_with_anki() {
    // Arrange

    let (injector, _, id) = imported_occlusion_given_a_mask_in_anki().await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let preview = service.preview().await.unwrap();
    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert!(preview.decks.is_empty());
    assert_eq!(2, preview.cards_edited_in_anki);
    assert_eq!(2, summary.edited_cards.len());
    let occlusions = scope.resolve::<dyn ImageOcclusionRepository>().await;
    let targets = occlusions.get_by_id(id).await.unwrap().target_keys();
    assert_eq!(vec!["c1", "c2", "c3"], targets);
    let c3 = occlusions
        .get_links(id)
        .await
        .unwrap()
        .into_iter()
        .find(|link| link.target_key == "c3")
        .unwrap();
    let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
    let all = links.get_all().await.unwrap();
    assert!(all.contains(&AnkiCardLink {
        card_id: c3.card_id,
        anki_card_id: AnkiCardId(3),
    }));
    let skipped = scope
        .resolve::<dyn AnkiSyncRepository>()
        .await
        .get_skipped_cards(PROFILE)
        .await
        .unwrap();
    assert!(!skipped.contains(&AnkiCardId(3)));
}

#[tokio::test]
async fn sync_imported_occlusion_whose_image_changed_in_anki_keeps_amber_masks() {
    // Arrange

    let (mut injector, _, id) = imported_occlusion_given_a_mask_in_anki().await;
    let anki = Arc::new(FakeAnki {
        edited_notes: vec![native_occlusion_note(3)],
        package: native_occlusion_package(&crate::import::anki::fixtures::png(80, 40), 3),
        ..FakeAnki::new(vec![1, 2, 3])
    });
    injector.register_singleton::<dyn AnkiConnectClient>(anki);
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;

    // Act

    let summary = service.sync(Vec::new()).await.unwrap();

    // Assert

    assert!(summary.edited_cards.is_empty());
    let occlusions = scope.resolve::<dyn ImageOcclusionRepository>().await;
    let targets = occlusions.get_by_id(id).await.unwrap().target_keys();
    assert_eq!(vec!["c1", "c2"], targets);
}

/// Syncs one new card of Amber's, which goes to Anki in a package.
async fn sync_new_card(anki: Arc<FakeAnki>) -> Result<AnkiSyncSummary, AnkiSyncError> {
    let injector = injector(anki, importing_nothing()).await;
    {
        let scope = injector.start_scope();
        create_card(&scope).await;
        scope.save_changes().await.unwrap();
    }
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    service.sync(Vec::new()).await
}

fn package_names(params: &[Value], key: &str) -> Vec<String> {
    let names = params.iter().map(|params| params[key].as_str().unwrap());
    let names = names.filter(|name| super::transfer::is_package(std::path::Path::new(name)));
    names.map(str::to_string).collect()
}

#[tokio::test]
async fn sync_media_folder_shared_with_anki_imports_the_package_amber_wrote_there() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        media_access: MediaFolderAccess::Shared(create_temp_directory().await),
        ..FakeAnki::new(Vec::new())
    });

    // Act

    sync_new_card(anki.clone()).await.unwrap();

    // Assert

    let [package] = anki
        .imported_packages
        .lock()
        .unwrap()
        .clone()
        .try_into()
        .unwrap();
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(package)).unwrap();
    assert!(zip.by_name("collection.anki2").is_ok());
    assert!(anki.params_of("storeMediaFile").is_empty());
    assert!(anki.packages_left().is_empty());
    assert!(anki.trashed_media.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_media_folder_out_of_amber_reach_sends_the_package_through_anki_connect() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());

    // Act

    sync_new_card(anki.clone()).await.unwrap();

    // Assert

    assert_eq!(1, anki.imported_packages.lock().unwrap().len());
    let stored = package_names(&anki.params_of("storeMediaFile"), "filename");
    assert_eq!(1, stored.len());
    assert!(anki.packages_left().is_empty());
    assert_eq!(stored, *anki.trashed_media.lock().unwrap());
}

#[tokio::test]
async fn sync_amber_write_to_the_media_folder_kept_from_anki_sends_the_package_through_anki_connect()
 {
    // Arrange

    let anki = Arc::new(FakeAnki {
        media_access: MediaFolderAccess::Redirected(create_temp_directory().await),
        ..FakeAnki::new(Vec::new())
    });

    // Act

    sync_new_card(anki.clone()).await.unwrap();

    // Assert

    assert_eq!(1, anki.imported_packages.lock().unwrap().len());
    assert_eq!(1, anki.params_of("storeMediaFile").len());
    assert!(anki.packages_left().is_empty());
}

#[tokio::test]
async fn sync_anki_refusing_the_import_still_removes_the_package() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        refuses_imports: true,
        ..FakeAnki::new(Vec::new())
    });

    // Act

    let result = sync_new_card(anki.clone()).await;

    // Assert

    assert!(result.is_err());
    assert_eq!(1, anki.params_of("storeMediaFile").len());
    assert!(anki.packages_left().is_empty());
}

/// Syncs, importing the deck `Spanish` from `anki`, and returns the package the importer was given.
async fn sync_importing_a_deck(anki: Arc<FakeAnki>) -> Vec<u8> {
    let given = Arc::new(Mutex::new(Vec::new()));
    let recorded = given.clone();
    let mut import_service = MockAnkiImportService::new();
    import_service
        .expect_import_cards()
        .returning(move |bytes, _, _, _, _| {
            *recorded.lock().unwrap() = bytes;
            Box::pin(async { Ok::<usize, AnkiImportError>(1) })
        });
    let injector = injector(anki, import_service).await;
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    service.sync(vec![choice("Spanish", true)]).await.unwrap();
    given.lock().unwrap().clone()
}

#[tokio::test]
async fn sync_deck_exported_to_a_shared_media_folder_read_and_removed_there() {
    // Arrange

    let anki = Arc::new(FakeAnki {
        media_access: MediaFolderAccess::Shared(create_temp_directory().await),
        ..FakeAnki::new(vec![7])
    });

    // Act

    let package = sync_importing_a_deck(anki.clone()).await;

    // Assert

    assert_eq!(b"package".to_vec(), package);
    let retrieved = package_names(&anki.params_of("retrieveMediaFile"), "filename");
    assert!(retrieved.is_empty());
    assert!(anki.packages_left().is_empty());
    assert!(anki.trashed_media.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_deck_exported_out_of_amber_reach_read_through_anki_connect() {
    // Arrange

    let anki = FakeAnki::holding(vec![7]);

    // Act

    let package = sync_importing_a_deck(anki.clone()).await;

    // Assert

    assert_eq!(b"package".to_vec(), package);
    let retrieved = package_names(&anki.params_of("retrieveMediaFile"), "filename");
    assert_eq!(1, retrieved.len());
    assert!(anki.packages_left().is_empty());
    assert_eq!(retrieved, *anki.trashed_media.lock().unwrap());
}

/// Syncs as the `sync_anki` command does, committing what the sync wrote last.
async fn sync_with_anki(device: &Injector, choices: Vec<AnkiDeckChoice>) -> AnkiSyncSummary {
    let scope = device.start_scope();
    let service = scope.resolve::<dyn AnkiSyncService>().await;
    let summary = service.sync(choices).await.unwrap();
    scope.save_changes().await.unwrap();
    summary
}

/// The note Anki holds for Amber's card `card_id`.
fn anki_note_of(anki: &FakeAnki, card_id: Uuid) -> Value {
    let guid = card_id.hyphenated().to_string();
    anki.collection(|collection| {
        let mut notes = collection.notes.iter();
        let note = notes.find(|note| AnkiCollection::guid_of(note) == Some(guid.as_str()));
        note.cloned().expect("Anki holds the card's note")
    })
}

fn first_card_of(note: &Value) -> i64 {
    note["cards"][0].as_i64().unwrap()
}

async fn move_into(scope: &injector::injector_scope::InjectorScope<'_>, card: Uuid, folder: Uuid) {
    use crate::elements::dto::move_element_dto::{DropPosition, MoveElementRequestDto};
    use crate::elements::services::element_move_service::ElementMoveService;
    let request = MoveElementRequestDto {
        dragged_id: ElementId::Card(card),
        target_id: Some(ElementId::Folder(folder)),
        position: DropPosition::Inside,
    };
    let mover = scope.resolve::<dyn ElementMoveService>().await;
    mover.move_element(request).await.unwrap();
}

#[tokio::test]
async fn sync_new_card_imported_by_anki_paired_with_the_card_anki_made_and_not_sent_again() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki.clone(), importing_nothing()).await;
    let card_id = {
        let scope = injector.start_scope();
        let card_id = create_card(&scope).await;
        scope.save_changes().await.unwrap();
        card_id
    };

    // Act

    let first = sync_with_anki(&injector, Vec::new()).await;
    let second = sync_with_anki(&injector, Vec::new()).await;

    // Assert

    let note = anki_note_of(&anki, card_id);
    assert_eq!(1, note["cards"].as_array().unwrap().len());
    assert_eq!("Amber", anki.deck_of(first_card_of(&note)));
    assert_eq!((1, 0), (first.sent_cards, second.sent_cards));
    assert_eq!(1, anki.imported_packages.lock().unwrap().len());
}

#[tokio::test]
async fn sync_card_moved_to_another_folder_moves_the_card_anki_importer_left_in_place() {
    // Arrange

    let anki = FakeAnki::holding(Vec::new());
    let injector = injector(anki.clone(), importing_nothing()).await;
    let (card_id, chemistry) = {
        let scope = injector.start_scope();
        let biology = create_folder_in(&scope, "Biology", None, None).await;
        let chemistry = create_folder_in(&scope, "Chemistry", None, None).await;
        let card_id = create_card(&scope).await;
        move_into(&scope, card_id, biology).await;
        scope.save_changes().await.unwrap();
        (card_id, chemistry)
    };
    sync_with_anki(&injector, Vec::new()).await;
    let card = first_card_of(&anki_note_of(&anki, card_id));
    let first_deck = anki.deck_of(card);
    {
        let scope = injector.start_scope();
        move_into(&scope, card_id, chemistry).await;
        scope.save_changes().await.unwrap();
    }

    // Act

    sync_with_anki(&injector, Vec::new()).await;

    // Assert

    assert_eq!("Amber::Biology", first_deck);
    assert_eq!("Amber::Chemistry", anki.deck_of(card));
}

/// One of the user's computers: its own Amber, recording changes for cloud sync as the app does.
async fn device(anki: Arc<FakeAnki>) -> Arc<Injector> {
    let mut device = injector(anki, importing_nothing()).await;
    // With cloud sync tracking changes, an in-memory database hangs, as `use_file_database` explains.
    use_file_database(&mut device).await;
    let device = Arc::new(device);
    crate::sync::bootstrap::register_sync_tables(&device)
        .await
        .unwrap();
    device
}

/// Carries `from`'s changes to `to`, as a cloud sync between the two computers does.
async fn cloud_sync(from: &Injector, to: &Injector) {
    let scope = from.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    let changes = store.changes_since_last_push().await.unwrap();
    scope.save_changes().await.unwrap();
    let scope = to.start_scope();
    let store = scope.resolve::<dyn SyncStore>().await;
    store.apply_remote(changes, true).await.unwrap();
    scope.save_changes().await.unwrap();
}

#[tokio::test]
async fn sync_deck_imported_on_another_computer_not_offered_or_imported_again() {
    // Arrange

    // Both Ankis hold card 7, as AnkiWeb keeps them alike.
    let laptop = device(FakeAnki::holding(vec![7])).await;
    let desktop_anki = FakeAnki::holding(vec![7]);
    let desktop = device(desktop_anki.clone()).await;
    {
        // What importing the deck on the laptop leaves behind.
        let scope = laptop.start_scope();
        let link = AnkiCardLink {
            card_id: create_card(&scope).await,
            anki_card_id: AnkiCardId(7),
        };
        let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
        links.create(&link).await.unwrap();
        scope.save_changes().await.unwrap();
    }

    // Act

    let before = previewed(&desktop).await;
    cloud_sync(&laptop, &desktop).await;
    let after = previewed(&desktop).await;
    let summary = sync_with_anki(&desktop, vec![choice("Spanish", true)]).await;

    // Assert

    assert_eq!(1, before.decks.len());
    assert!(after.decks.is_empty());
    assert_eq!(0, summary.imported_cards);
    assert!(desktop_anki.exported_decks.lock().unwrap().is_empty());
}

#[tokio::test]
async fn sync_review_another_computer_answered_in_its_anki_not_taken_back_as_new() {
    // Arrange

    let good_at = an_hour_ago();
    let laptop_anki = Arc::new(anki_reviewed_at(good_at));
    let laptop = device(laptop_anki.clone()).await;
    answer_again_in_amber(&laptop, good_at).await;
    sync_with_anki(&laptop, Vec::new()).await;
    // AnkiWeb brings the laptop Anki's answer to the desktop's Anki.
    let (_, answer_id, ease) = laptop_anki.answered.lock().unwrap()[0];
    let answer = json!({ "id": answer_id, "ease": ease, "time": 0, "ivl": -600, "type": 2 });
    let desktop_anki = Arc::new(FakeAnki {
        reviews: json!({ "7": [laptop_anki.reviews["7"][0].clone(), answer] }),
        schedules: Mutex::new(laptop_anki.schedules.lock().unwrap().clone()),
        ..FakeAnki::new(vec![7])
    });
    let desktop = device(desktop_anki.clone()).await;

    // Act

    cloud_sync(&laptop, &desktop).await;
    let summary = sync_with_anki(&desktop, Vec::new()).await;

    // Assert

    assert_eq!((0, 0), (summary.pulled_reviews, summary.pushed_reviews));
    assert!(desktop_anki.answered.lock().unwrap().is_empty());
}

async fn reviews_of(device: &Injector, card_id: Uuid) -> usize {
    let scope = device.start_scope();
    let logs = scope.resolve::<dyn CardReviewLogRepository>().await;
    let histories = logs.get_card_histories().await.unwrap();
    histories
        .iter()
        .filter(|log| log.card_id == Some(card_id))
        .count()
}

#[tokio::test]
async fn sync_anki_review_both_computers_took_before_cloud_syncing_kept_once() {
    // Arrange

    let reviewed_at = an_hour_ago();
    let laptop = device(Arc::new(anki_reviewed_at(reviewed_at))).await;
    let desktop = device(Arc::new(anki_reviewed_at(reviewed_at))).await;
    let card_id = {
        let scope = laptop.start_scope();
        let card_id = create_card(&scope).await;
        let links = scope.resolve::<dyn AnkiCardLinkRepository>().await;
        let link = AnkiCardLink {
            card_id,
            anki_card_id: AnkiCardId(7),
        };
        links.create(&link).await.unwrap();
        scope.save_changes().await.unwrap();
        card_id
    };
    cloud_sync(&laptop, &desktop).await;

    // Act

    let on_laptop = sync_with_anki(&laptop, Vec::new()).await;
    let on_desktop = sync_with_anki(&desktop, Vec::new()).await;
    cloud_sync(&laptop, &desktop).await;
    cloud_sync(&desktop, &laptop).await;

    // Assert

    assert_eq!(
        (1, 1),
        (on_laptop.pulled_reviews, on_desktop.pulled_reviews)
    );
    assert_eq!(1, reviews_of(&laptop, card_id).await);
    assert_eq!(1, reviews_of(&desktop, card_id).await);
}
