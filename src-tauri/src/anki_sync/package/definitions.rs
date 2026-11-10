use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::anki_sync::entities::anki_notetype::AnkiNotetype;

pub const BASIC_FRONT_FIELD: &str = "Front";
pub const BASIC_BACK_FIELD: &str = "Back";
/// A last field no template shows, holding the guid, which AnkiConnect can't read; notes are found by it.
pub const AMBER_ID_FIELD: &str = "Amber ID";
/// An image occlusion's hidden field after the Amber ID: which target each cloze number belongs to.
pub const AMBER_TARGETS_FIELD: &str = "Amber Targets";

/// Anki's stock Basic and Image Occlusion notetypes and default deck options, as Anki itself defines them.
const STOCK: &str = include_str!("stock.json");
/// Bumped when a notetype changes, so Anki updates its copy on the next import.
const NOTETYPE_MODIFIED: i64 = 1_793_836_800;
const DEFAULT_DECK_ID: i64 = 1;

fn stock() -> Value {
    serde_json::from_str(STOCK).expect("valid stock definitions")
}

pub(super) fn notetypes() -> Value {
    let stock = stock();
    let mut models = serde_json::Map::new();
    for notetype in [AnkiNotetype::Basic, AnkiNotetype::ImageOcclusion] {
        let (key, name) = notetype.definition();
        let mut model = stock[key].clone();
        model["id"] = json!(notetype.id());
        model["name"] = json!(name);
        model["mod"] = json!(NOTETYPE_MODIFIED);
        model["usn"] = json!(-1);
        model["did"] = json!(DEFAULT_DECK_ID);
        let fields = model["flds"]
            .as_array_mut()
            .expect("stock notetypes have fields");
        let hidden: &[&str] = match notetype {
            AnkiNotetype::Basic => &[AMBER_ID_FIELD],
            AnkiNotetype::ImageOcclusion => &[AMBER_ID_FIELD, AMBER_TARGETS_FIELD],
        };
        for name in hidden {
            let mut field = fields[0].clone();
            field["name"] = json!(name);
            field["ord"] = json!(fields.len());
            fields.push(field);
        }
        models.insert(notetype.id().to_string(), model);
    }
    Value::Object(models)
}

pub(super) fn deck_config(now: i64) -> Value {
    let mut config = stock()["deckConfig"].clone();
    config["mod"] = json!(now);
    config["usn"] = json!(-1);
    config
}

/// Every deck the notes use, with the parents of subdecks.
pub(super) fn decks<'a>(names: impl Iterator<Item = &'a String>, now: i64) -> Value {
    let mut decks = serde_json::Map::new();
    let mut add = |id: i64, name: &str| {
        decks.insert(
            id.to_string(),
            json!({
                "id": id, "name": name, "mod": now, "usn": -1, "desc": "", "dyn": 0, "conf": 1,
                "collapsed": false, "browserCollapsed": false, "extendNew": 0, "extendRev": 0,
                "newToday": [0, 0], "revToday": [0, 0], "lrnToday": [0, 0], "timeToday": [0, 0],
            }),
        );
    };
    add(DEFAULT_DECK_ID, "Default");
    for name in names {
        let parts: Vec<&str> = name.split("::").collect();
        for depth in 1..=parts.len() {
            let path = parts[..depth].join("::");
            add(stable_id(&path), &path);
        }
    }
    Value::Object(decks)
}

/// A positive id that fits in a JavaScript number, the same for the same text.
pub(super) fn stable_id(text: &str) -> i64 {
    let digest = Sha256::digest(text.as_bytes());
    let bytes: [u8; 8] = digest[..8].try_into().expect("8 bytes");
    (u64::from_be_bytes(bytes) >> 11) as i64
}
