use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;

use rusqlite::{Connection, DatabaseName};

pub fn build_package(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let mut writer = zip::ZipWriter::new(Cursor::new(&mut buf));
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, contents) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap();
    }
    buf
}

pub fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    image::RgbImage::new(width, height)
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .unwrap();
    bytes
}

/// A basic and a cloze note, all three cards in `Spanish::Verbs`.
pub fn legacy_package() -> Vec<u8> {
    build_package(&[
        ("collection.anki2", &legacy_collection_bytes()),
        ("media", b"{}"),
    ])
}

/// Two Image Occlusion Enhanced notes of one 40×20 image in `Algebra`, tagged `algebra`; also returns the image.
pub fn enhanced_occlusion_package() -> (Vec<u8>, Vec<u8>) {
    let models = serde_json::json!({
        "40": {
            "name": "Image Occlusion Enhanced", "type": 0,
            "flds": [
                {"name": "ID (hidden)", "ord": 0}, {"name": "Header", "ord": 1},
                {"name": "Image", "ord": 2}, {"name": "Question Mask", "ord": 3},
                {"name": "Original Mask", "ord": 4}
            ],
            "tmpls": [{
                "name": "IO Card", "ord": 0,
                "qfmt": "<div id=\"io-overlay\">{{Question Mask}}</div><div id=\"io-original\">{{Image}}</div>",
                "afmt": "{{Image}}<button id=\"io-revl-btn\">Toggle Masks</button>"
            }]
        }
    });
    let decks = serde_json::json!({"1": {"name": "Algebra"}});
    let collection = build_legacy_collection(
        &models,
        &decks,
        "INSERT INTO notes VALUES (400, 40, ' algebra ', 'abc-ao-1\x1fRow reduction\x1f<img src=\"pic.png\" />\x1f<img src=\"abc-ao-1-Q.svg\" />\x1f<img src=\"abc-ao-O.svg\">');
         INSERT INTO notes VALUES (401, 40, ' algebra ', 'abc-ao-2\x1fRow reduction\x1f<img src=\"pic.png\" />\x1f<img src=\"abc-ao-2-Q.svg\" />\x1f<img src=\"abc-ao-O.svg\">');
         INSERT INTO cards VALUES (1, 400, 1, 0, 0);
         INSERT INTO cards VALUES (2, 401, 1, 0, 0);",
    );
    let image = png(40, 20);
    let mask = br##"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">
        <g><title>Labels</title></g>
        <g><title>Masks</title>
          <rect id="abc-ao-1" x="4" y="2" width="8" height="4" fill="#FFEBA2"/>
          <g id="abc-ao-2"><rect x="20" y="10" width="4" height="2" fill="#FFEBA2"/><rect x="0" y="0" width="2" height="2" fill="#FFEBA2"/></g>
        </g>
    </svg>"##;
    let package = build_package(&[
        ("collection.anki2", &collection),
        ("media", br#"{"0": "pic.png", "1": "abc-ao-O.svg"}"#),
        ("0", &image),
        ("1", mask),
    ]);
    (package, image)
}

/// A schema 11 collection (as `collection.anki2`/`.anki21` hold) with one basic and one cloze note.
pub fn legacy_collection_bytes() -> Vec<u8> {
    let models = serde_json::json!({
        "10": {
            "name": "Basic", "type": 0,
            "flds": [{"name": "Back", "ord": 1}, {"name": "Front", "ord": 0}],
            "tmpls": [{"name": "Card 1", "ord": 0, "qfmt": "{{Front}}", "afmt": "{{FrontSide}}<hr id=answer>{{Back}}"}]
        },
        "20": {
            "name": "Cloze", "type": 1,
            "flds": [{"name": "Text", "ord": 0}, {"name": "Back Extra", "ord": 1}],
            "tmpls": [{"name": "Cloze", "ord": 0, "qfmt": "{{cloze:Text}}", "afmt": "{{cloze:Text}}<br>{{Back Extra}}"}]
        }
    });
    let decks = serde_json::json!({
        "1": {"name": "Default"},
        "2": {"name": "Spanish::Verbs"}
    });
    build_legacy_collection(
        &models,
        &decks,
        "INSERT INTO notes VALUES (100, 10, ' vocab ', 'hablar\x1fto speak');
         INSERT INTO notes VALUES (200, 20, '', '{{c1::Madrid}} is in {{c2::Spain}}\x1fextra');
         INSERT INTO cards VALUES (1, 100, 2, 0, 0);
         INSERT INTO cards VALUES (2, 200, 9, 0, 2);
         INSERT INTO cards VALUES (3, 200, 2, 1, 0);",
    )
}

/// A schema 11 collection of the given notetypes and decks, its notes and cards inserted by `rows`.
pub fn build_legacy_collection(
    models: &serde_json::Value,
    decks: &serde_json::Value,
    rows: &str,
) -> Vec<u8> {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE col (models TEXT NOT NULL, decks TEXT NOT NULL);
        CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL);
        CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, odid INTEGER NOT NULL);
        "#,
    )
    .unwrap();
    conn.execute(
        "INSERT INTO col VALUES (?1, ?2)",
        [models.to_string(), decks.to_string()],
    )
    .unwrap();
    conn.execute_batch(rows).unwrap();
    conn.serialize(DatabaseName::Main).unwrap().to_vec()
}
