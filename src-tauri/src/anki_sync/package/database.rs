use rusqlite::{Connection, DatabaseName, params};

/// A note row of the schema 11 `notes` table.
pub(super) struct NoteRow<'a> {
    pub id: i64,
    pub guid: &'a str,
    pub notetype_id: i64,
    pub modified: i64,
    /// Space-separated, with a space on each end.
    pub tags: String,
    /// Separated by the unit separator.
    pub fields: String,
}

/// A new card row of the schema 11 `cards` table.
pub(super) struct CardRow {
    pub id: i64,
    pub note_id: i64,
    pub deck_id: i64,
    pub ord: usize,
    pub modified: i64,
    /// A new card's position in the new queue.
    pub due: usize,
}

/// The schema 11 `col` row, its notetypes, decks and deck options as JSON.
pub(super) struct CollectionRow {
    pub now: i64,
    pub notetypes: String,
    pub decks: String,
    pub deck_configs: String,
}

/// An in-memory schema 11 collection, written row by row.
pub(super) struct CollectionDatabase(Connection);

impl CollectionDatabase {
    pub fn create() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(conn))
    }

    pub fn insert_note(&self, note: &NoteRow) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO notes VALUES (?1, ?2, ?3, ?4, -1, ?5, ?6, '', 0, 0, '')",
            params![
                note.id,
                note.guid,
                note.notetype_id,
                note.modified,
                note.tags,
                note.fields
            ],
        )?;
        Ok(())
    }

    pub fn insert_card(&self, card: &CardRow) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO cards VALUES (?1, ?2, ?3, ?4, ?5, -1, 0, 0, ?6, 0, 0, 0, 0, 0, 0, 0, 0, '')",
            params![
                card.id,
                card.note_id,
                card.deck_id,
                card.ord,
                card.modified,
                card.due
            ],
        )?;
        Ok(())
    }

    pub fn insert_collection(&self, collection: &CollectionRow) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO col VALUES (1, ?1, ?2, ?2, 11, 0, 0, 0, '{}', ?3, ?4, ?5, '{}')",
            params![
                collection.now,
                collection.now * 1000,
                collection.notetypes,
                collection.decks,
                collection.deck_configs
            ],
        )?;
        Ok(())
    }

    /// The database file's bytes.
    pub fn into_bytes(self) -> rusqlite::Result<Vec<u8>> {
        Ok(self.0.serialize(DatabaseName::Main)?.to_vec())
    }
}

const SCHEMA: &str = r#"
CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL,
    ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
    models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);
CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL,
    usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL,
    flags integer NOT NULL, data text NOT NULL);
CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL,
    mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL,
    ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL,
    odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL,
    ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
"#;
