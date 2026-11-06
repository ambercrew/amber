use std::collections::HashMap;

use prost::Message;
use rusqlite::Connection;

use super::NotetypesAndDecks;
use crate::import::anki::entities::notetype::Notetype;
use crate::import::anki::entities::template::Template;

/// Schema 18 joins deck names with the unit separator.
const DECK_SEPARATOR: char = '\x1f';

/// Schema 18 gives notetypes, their fields and templates, and decks tables of their own.
pub(super) fn read_notetypes_and_decks(conn: &Connection) -> rusqlite::Result<NotetypesAndDecks> {
    Ok((read_notetypes(conn)?, read_decks(conn)?))
}

/// Only the fields read here; prost skips the rest of Anki's `NotetypeConfig`.
#[derive(Clone, PartialEq, Message)]
pub(super) struct NotetypeConfig {
    #[prost(int32, tag = "1")]
    pub(super) kind: i32,
    #[prost(string, tag = "3")]
    pub(super) css: String,
}

/// Only the fields read here; prost skips the rest of Anki's `TemplateConfig`.
#[derive(Clone, PartialEq, Message)]
pub(super) struct TemplateConfig {
    #[prost(string, tag = "1")]
    pub(super) q_format: String,
    #[prost(string, tag = "2")]
    pub(super) a_format: String,
}

fn read_notetypes(conn: &Connection) -> rusqlite::Result<HashMap<i64, Notetype>> {
    let mut notetypes = HashMap::new();
    let mut statement = conn.prepare("SELECT id, name, config FROM notetypes")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Vec<u8>>(2)?,
        ))
    })?;
    for row in rows {
        let (id, name, config) = row?;
        let config = NotetypeConfig::decode(config.as_slice()).unwrap_or_default();
        notetypes.insert(
            id,
            Notetype {
                name,
                is_cloze: config.kind == 1,
                css: config.css,
                fields: Vec::new(),
                templates: Vec::new(),
            },
        );
    }

    let mut statement = conn.prepare("SELECT ntid, name FROM fields ORDER BY ntid, ord")?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get(1)?)))?;
    for row in rows {
        let (notetype_id, name) = row?;
        if let Some(notetype) = notetypes.get_mut(&notetype_id) {
            notetype.fields.push(name);
        }
    }

    let mut statement =
        conn.prepare("SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Vec<u8>>(3)?,
        ))
    })?;
    for row in rows {
        let (notetype_id, ord, name, config) = row?;
        let Ok(config) = TemplateConfig::decode(config.as_slice()) else {
            continue;
        };
        if let Some(notetype) = notetypes.get_mut(&notetype_id) {
            notetype.templates.push(Template {
                ord,
                name,
                question: config.q_format,
                answer: config.a_format,
            });
        }
    }
    Ok(notetypes)
}

fn read_decks(conn: &Connection) -> rusqlite::Result<HashMap<i64, Vec<String>>> {
    let mut statement = conn.prepare("SELECT id, name FROM decks")?;
    let rows = statement.query_map([], |row| {
        let name: String = row.get(1)?;
        Ok((
            row.get(0)?,
            name.split(DECK_SEPARATOR).map(str::to_string).collect(),
        ))
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use rusqlite::DatabaseName;

    use super::super::read_collection;
    use super::*;

    #[test]
    fn read_collection_schema_18_reads_protobuf_configs() {
        // Arrange

        let conn = Connection::open_in_memory().unwrap();
        conn.create_collation("unicase", |a, b| a.cmp(b)).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE notetypes (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE unicase, config BLOB NOT NULL);
            CREATE TABLE fields (ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL COLLATE unicase);
            CREATE TABLE templates (ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL COLLATE unicase, config BLOB NOT NULL);
            CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE unicase);
            CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL);
            CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, odid INTEGER NOT NULL);
            "#,
        )
        .unwrap();
        let notetype_config = NotetypeConfig {
            kind: 1,
            css: ".m { font-weight: bold }".to_string(),
        }
        .encode_to_vec();
        let template_config = TemplateConfig {
            q_format: "{{cloze:Text}}".to_string(),
            a_format: "{{cloze:Text}}".to_string(),
        }
        .encode_to_vec();
        conn.execute(
            "INSERT INTO notetypes VALUES (20, 'Cloze', ?1)",
            [notetype_config],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO templates VALUES (20, 0, 'Cloze', ?1)",
            [template_config],
        )
        .unwrap();
        conn.execute_batch(
            "INSERT INTO fields VALUES (20, 0, 'Text');
             INSERT INTO decks VALUES (2, 'Spanish\x1fVerbs');",
        )
        .unwrap();
        let bytes = conn.serialize(DatabaseName::Main).unwrap().to_vec();

        // Act

        let collection = read_collection(bytes).unwrap();

        // Assert

        let cloze = &collection.notetypes[&20];
        assert!(cloze.is_cloze);
        assert_eq!(".m { font-weight: bold }", cloze.css);
        assert_eq!(vec!["Text"], cloze.fields);
        assert_eq!("{{cloze:Text}}", cloze.templates[0].question);
        assert_eq!(vec!["Spanish", "Verbs"], collection.decks[&2]);
    }
}
