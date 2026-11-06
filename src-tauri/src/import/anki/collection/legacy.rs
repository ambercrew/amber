use std::collections::HashMap;

use rusqlite::Connection;
use serde::Deserialize;

use super::NotetypesAndDecks;
use crate::import::anki::entities::notetype::Notetype;
use crate::import::anki::entities::template::Template;

/// Schema 11 joins deck names with `::`.
const DECK_SEPARATOR: &str = "::";

#[derive(Deserialize)]
struct LegacyNotetype {
    name: String,
    #[serde(rename = "type", default)]
    kind: i64,
    flds: Vec<LegacyField>,
    tmpls: Vec<LegacyTemplate>,
    #[serde(default)]
    css: String,
}

#[derive(Deserialize)]
struct LegacyField {
    name: String,
    ord: i64,
}

#[derive(Deserialize)]
struct LegacyTemplate {
    name: String,
    ord: i64,
    qfmt: String,
    afmt: String,
}

#[derive(Deserialize)]
struct LegacyDeck {
    name: String,
}

/// Schema 11 keeps notetypes and decks as JSON in the `col` row.
pub(super) fn read_notetypes_and_decks(conn: &Connection) -> rusqlite::Result<NotetypesAndDecks> {
    let (models, decks): (String, String) =
        conn.query_row("SELECT models, decks FROM col", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
    let models: HashMap<String, LegacyNotetype> = parse_json(&models)?;
    let decks: HashMap<String, LegacyDeck> = parse_json(&decks)?;

    let notetypes = models
        .into_iter()
        .filter_map(|(id, mut model)| {
            model.flds.sort_by_key(|field| field.ord);
            let notetype = Notetype {
                name: model.name,
                is_cloze: model.kind == 1,
                css: model.css,
                fields: model.flds.into_iter().map(|field| field.name).collect(),
                templates: model
                    .tmpls
                    .into_iter()
                    .map(|template| Template {
                        ord: template.ord,
                        name: template.name,
                        question: template.qfmt,
                        answer: template.afmt,
                    })
                    .collect(),
            };
            Some((id.parse().ok()?, notetype))
        })
        .collect();
    let decks = decks
        .into_iter()
        .filter_map(|(id, deck)| {
            let path = deck
                .name
                .split(DECK_SEPARATOR)
                .map(str::to_string)
                .collect();
            Some((id.parse().ok()?, path))
        })
        .collect();
    Ok((notetypes, decks))
}

fn parse_json<T: for<'de> Deserialize<'de>>(json: &str) -> rusqlite::Result<T> {
    serde_json::from_str(json).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, e.into())
    })
}
