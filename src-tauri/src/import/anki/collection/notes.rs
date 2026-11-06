use std::collections::HashMap;

use rusqlite::Connection;

use crate::import::anki::entities::card_row::CardRow;
use crate::import::anki::entities::note::Note;

const FIELD_SEPARATOR: char = '\x1f';

/// Both schemas store notes and cards alike.
pub(super) fn read_notes(conn: &Connection) -> rusqlite::Result<HashMap<i64, Note>> {
    let mut statement = conn.prepare("SELECT id, mid, tags, flds FROM notes")?;
    let rows = statement.query_map([], |row| {
        let tags: String = row.get(2)?;
        let fields: String = row.get(3)?;
        Ok((
            row.get(0)?,
            Note {
                notetype_id: row.get(1)?,
                fields: fields.split(FIELD_SEPARATOR).map(str::to_string).collect(),
                tags: tags.split_whitespace().map(str::to_string).collect(),
            },
        ))
    })?;
    rows.collect()
}

pub(super) fn read_cards(conn: &Connection) -> rusqlite::Result<Vec<CardRow>> {
    // A card in a filtered deck belongs to its original deck (`odid`).
    let mut statement = conn.prepare(
        "SELECT id, nid, CASE WHEN odid != 0 THEN odid ELSE did END, ord FROM cards ORDER BY nid, ord",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(CardRow {
            id: row.get(0)?,
            note_id: row.get(1)?,
            deck_id: row.get(2)?,
            ord: row.get(3)?,
        })
    })?;
    rows.collect()
}
