use std::collections::BTreeMap;
use std::io::{Cursor, Write};

use serde_json::{Value, json};
use thiserror::Error;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

use super::collection::write_collection;
use crate::anki_sync::entities::anki_note::AnkiNote;

#[derive(Debug, Error)]
pub enum AnkiPackageError {
    #[error("Writing the Anki collection failed")]
    Database(#[from] rusqlite::Error),
    #[error("Writing the Anki package failed")]
    Zip(#[from] zip::result::ZipError),
    #[error("Writing the Anki package failed")]
    Io(#[from] std::io::Error),
}

/// An `.apkg` in the legacy schema 11 format, which every Anki version imports. `media` maps filename to bytes.
pub fn write_package(
    notes: &[AnkiNote],
    media: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<u8>, AnkiPackageError> {
    let collection = write_collection(notes)?;
    let mut buf = Vec::new();
    let mut zip = ZipWriter::new(Cursor::new(&mut buf));
    let options = SimpleFileOptions::default();
    zip.start_file("collection.anki2", options)?;
    zip.write_all(&collection)?;
    let mut media_map = serde_json::Map::new();
    for (index, (name, data)) in media.iter().enumerate() {
        media_map.insert(index.to_string(), json!(name));
        zip.start_file(index.to_string(), options)?;
        zip.write_all(data)?;
    }
    zip.start_file("media", options)?;
    zip.write_all(Value::Object(media_map).to_string().as_bytes())?;
    zip.finish()?;
    Ok(buf)
}

/// Packages of `notes` of at most `limit` bytes each, every one with only the media its notes show, halving
/// the notes until they fit. A note too large alone keeps a package of its own.
pub fn write_packages(
    notes: &[AnkiNote],
    media: &BTreeMap<String, Vec<u8>>,
    limit: usize,
) -> Result<Vec<Vec<u8>>, AnkiPackageError> {
    let package = write_package(notes, &media_of(notes, media))?;
    if package.len() <= limit || notes.len() <= 1 {
        return Ok(vec![package]);
    }
    let (first, second) = notes.split_at(notes.len() / 2);
    let mut packages = write_packages(first, media, limit)?;
    packages.extend(write_packages(second, media, limit)?);
    Ok(packages)
}

/// The media named in a field of any of `notes`.
fn media_of(notes: &[AnkiNote], media: &BTreeMap<String, Vec<u8>>) -> BTreeMap<String, Vec<u8>> {
    let shown = |name: &str| {
        notes.iter().any(|note| {
            let mut fields = note.fields.iter().chain(&note.hidden_fields);
            fields.any(|field| field.contains(name))
        })
    };
    media
        .iter()
        .filter(|(name, _)| shown(name))
        .map(|(name, data)| (name.clone(), data.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anki_sync::entities::anki_notetype::AnkiNotetype;
    use crate::import::anki::extraction::extract_anki;
    use crate::import::anki::fixtures::png;

    fn note(notetype: AnkiNotetype, fields: &[&str], hidden_fields: &[&str]) -> AnkiNote {
        AnkiNote {
            guid: format!("{notetype:?}"),
            notetype,
            fields: fields.iter().map(|field| field.to_string()).collect(),
            tags: vec!["biology".into()],
            deck: "Biology::Cells".into(),
            modified: 100,
            hidden_fields: hidden_fields
                .iter()
                .map(|field| field.to_string())
                .collect(),
            card_ords: vec![0],
        }
    }

    #[test]
    fn write_package_basic_and_occlusion_notes_read_back_by_the_importer() {
        // Arrange

        let notes = [
            note(
                AnkiNotetype::Basic,
                &["What is a cell?", "The unit of life"],
                &[],
            ),
            note(
                AnkiNotetype::ImageOcclusion,
                &[
                    "{{c1::image-occlusion:rect:left=0.1:top=0.2:width=0.3:height=0.4:oi=1}}",
                    "<img src=\"cell.png\">",
                    "Cell",
                    "",
                    "",
                ],
                &["[\"a\"]"],
            ),
        ];
        let media = BTreeMap::from([("cell.png".to_string(), png(10, 10))]);

        // Act

        let package = write_package(&notes, &media).unwrap();

        // Assert

        let extraction = extract_anki(package).unwrap();
        let [deck] = extraction.decks.as_slice() else {
            panic!("expected one deck");
        };
        assert_eq!(vec!["Biology", "Cells"], deck.path);
        assert_eq!(1, deck.cards.len());
        assert!(deck.cards[0].front.contains("What is a cell?"));
        assert_eq!(vec!["biology"], deck.cards[0].tags);
        assert_eq!(1, deck.image_occlusions.len());
        assert_eq!("Cell", deck.image_occlusions[0].name);
        assert_eq!(1, extraction.images.len());
    }

    fn basic_note(guid: &str, image: &str) -> AnkiNote {
        let back = format!("<img src=\"{image}\">");
        AnkiNote {
            guid: guid.to_string(),
            ..note(AnkiNotetype::Basic, &["Front", &back], &[])
        }
    }

    /// Bytes that don't compress, so a package's size follows its media's.
    fn noise(len: usize) -> Vec<u8> {
        let mut state: u32 = 0x9E37_79B9;
        (0..len)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                state as u8
            })
            .collect()
    }

    #[test]
    fn write_packages_under_the_limit_writes_one_package() {
        // Arrange

        let notes = [basic_note("a", "a.png"), basic_note("b", "b.png")];
        let media = BTreeMap::from([("a.png".to_string(), png(10, 10))]);

        // Act

        let packages = write_packages(&notes, &media, usize::MAX).unwrap();

        // Assert

        let [package] = packages.as_slice() else {
            panic!("expected one package");
        };
        let extraction = extract_anki(package.clone()).unwrap();
        assert_eq!(2, extraction.decks[0].cards.len());
    }

    #[test]
    fn write_packages_over_the_limit_splits_notes_with_only_their_media() {
        // Arrange

        let notes = [
            basic_note("a", "a.bin"),
            basic_note("b", "b.bin"),
            basic_note("c", "c.bin"),
        ];
        let media: BTreeMap<String, Vec<u8>> = ["a.bin", "b.bin", "c.bin"]
            .into_iter()
            .map(|name| (name.to_string(), noise(40_000)))
            .collect();

        // Act

        let packages = write_packages(&notes, &media, 60_000).unwrap();

        // Assert

        assert_eq!(3, packages.len());
        assert!(packages.iter().all(|package| package.len() <= 60_000));
        let mut guids: Vec<String> = Vec::new();
        for package in packages {
            let mut zip = zip::ZipArchive::new(Cursor::new(package)).unwrap();
            let mut listed = String::new();
            std::io::Read::read_to_string(&mut zip.by_name("media").unwrap(), &mut listed).unwrap();
            let listed: BTreeMap<String, String> = serde_json::from_str(&listed).unwrap();
            let [name] = listed.values().collect::<Vec<_>>()[..] else {
                panic!("expected one media file");
            };
            guids.push(name.trim_end_matches(".bin").to_string());
        }
        assert_eq!(vec!["a", "b", "c"], guids);
    }

    #[test]
    fn write_packages_one_note_over_the_limit_keeps_its_own_package() {
        // Arrange

        let notes = [basic_note("a", "a.bin")];
        let media = BTreeMap::from([("a.bin".to_string(), noise(40_000))]);

        // Act

        let packages = write_packages(&notes, &media, 1_000).unwrap();

        // Assert

        assert_eq!(1, packages.len());
        assert!(packages[0].len() > 40_000);
    }
}
