use std::collections::{BTreeMap, HashMap};
use std::io::Cursor;

use zip::ZipArchive;

use crate::assets::entities::asset::Asset;
use thiserror::Error;

use super::collection::read_collection;
use super::entities::anki_card::AnkiCard;
use super::entities::anki_deck::AnkiDeck;
use super::entities::anki_occlusion::AnkiOcclusion;
use super::entities::collection::Collection;
use super::math::convert_math;
use super::media::MediaLocalizer;
use super::occlusions::{card_target_key, convert_occlusion, note_occlusion_key, occlusion_format};
use super::package::read_collection_bytes;
use super::template::{CardContext, is_blank, render_card};

const DEFAULT_DECK: &str = "Default";

/// An Anki package's cards as HTML, whose images reference `images` as `amber-asset:<id>` srcs not yet stored.
pub struct AnkiExtraction {
    pub decks: Vec<AnkiDeck>,
    pub images: Vec<Asset>,
}

#[derive(Debug, Error)]
pub enum AnkiExtractionError {
    #[error("This isn't a valid Anki package.")]
    InvalidPackage,

    /// Matched by the import modal, which explains that nothing was found.
    #[error("no-content")]
    NoContent,
}

/// Reads an `.apkg` deck export or `.colpkg` collection backup, in either the legacy or the current format.
pub fn extract_anki(bytes: Vec<u8>) -> Result<AnkiExtraction, AnkiExtractionError> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| AnkiExtractionError::InvalidPackage)?;
    let collection_bytes =
        read_collection_bytes(&mut archive).ok_or(AnkiExtractionError::InvalidPackage)?;
    let collection =
        read_collection(collection_bytes).map_err(|_| AnkiExtractionError::InvalidPackage)?;
    let mut localizer = MediaLocalizer::new(&mut archive);

    let decks = render_decks(&collection, &mut localizer);
    if decks.is_empty() {
        return Err(AnkiExtractionError::NoContent);
    }
    Ok(AnkiExtraction {
        decks,
        images: localizer.into_images(),
    })
}

#[derive(Default)]
struct DeckContent {
    cards: Vec<AnkiCard>,
    image_occlusions: Vec<AnkiOcclusion>,
}

/// One deck per path, sorted so parents precede their subdecks; decks without cards are left out.
fn render_decks(collection: &Collection, localizer: &mut MediaLocalizer) -> Vec<AnkiDeck> {
    let default_deck = vec![DEFAULT_DECK.to_string()];
    let mut decks: BTreeMap<&[String], DeckContent> = BTreeMap::new();
    // Where each occlusion seen went; one that didn't convert has its cards rendered like any other.
    let mut occlusions: HashMap<String, Option<(&[String], usize)>> = HashMap::new();

    for card in &collection.cards {
        let Some(note) = collection.notes.get(&card.note_id) else {
            continue;
        };
        let Some(notetype) = collection.notetypes.get(&note.notetype_id) else {
            continue;
        };
        if let Some(format) = occlusion_format(notetype) {
            let key = note_occlusion_key(format, card.note_id, note, notetype);
            let location = match occlusions.get(&key) {
                Some(location) => *location,
                None => {
                    // Its cards all become one occlusion, in the first card's deck.
                    let location =
                        convert_occlusion(format, note, notetype, localizer).map(|occlusion| {
                            let deck = collection.decks.get(&card.deck_id).unwrap_or(&default_deck);
                            let occlusions = &mut decks.entry(deck).or_default().image_occlusions;
                            occlusions.push(occlusion);
                            (deck.as_slice(), occlusions.len() - 1)
                        });
                    occlusions.insert(key, location);
                    location
                }
            };
            if let Some((deck, index)) = location {
                if let Some(target) = card_target_key(format, note, notetype, card.ord) {
                    let occlusion = &mut decks
                        .get_mut(deck)
                        .expect("deck was added")
                        .image_occlusions[index];
                    occlusion.anki_cards.push((target, card.id));
                }
                continue;
            }
        }
        // A cloze notetype has one template, its cards numbered by cloze instead.
        let template = if notetype.is_cloze {
            notetype.templates.first()
        } else {
            notetype.templates.iter().find(|t| t.ord == card.ord)
        };
        let Some(template) = template else {
            continue;
        };
        let deck = collection.decks.get(&card.deck_id).unwrap_or(&default_deck);

        let fields: HashMap<&str, &str> = notetype
            .fields
            .iter()
            .map(String::as_str)
            .zip(note.fields.iter().map(String::as_str))
            .collect();
        let context = CardContext {
            fields,
            tags: &note.tags,
            deck,
            card_name: &template.name,
            notetype_name: &notetype.name,
            cloze_ord: notetype.is_cloze.then(|| card.ord as u32 + 1),
        };
        let (front, back) = render_card(&template.question, &template.answer, &context);
        // Anki wouldn't show it either: its fields were emptied after the card was generated.
        if is_blank(&front) {
            continue;
        }

        // As Anki does, so the frontend can keep what the note type's classes mean (bold, hidden…).
        let style = styled(&notetype.css);
        decks.entry(deck).or_default().cards.push(AnkiCard {
            front: format!("{style}{}", localizer.localize(&convert_math(&front))),
            back: format!("{style}{}", localizer.localize(&convert_math(&back))),
            tags: note.tags.clone(),
            anki_card_id: card.id,
        });
    }

    decks
        .into_iter()
        .map(|(path, content)| AnkiDeck {
            path: path.to_vec(),
            cards: content.cards,
            image_occlusions: content.image_occlusions,
        })
        .collect()
}

fn styled(css: &str) -> String {
    if css.trim().is_empty() {
        String::new()
    } else {
        format!("<style>{}</style>", css.replace("</style", "<\\/style"))
    }
}

#[cfg(test)]
mod tests {
    use super::super::fixtures::{
        build_legacy_collection, build_package, enhanced_occlusion_package,
        legacy_collection_bytes, png,
    };
    use super::*;
    use crate::assets::value_objects::asset_id::AssetId;
    use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;

    fn encode_zstd(bytes: &[u8]) -> Vec<u8> {
        ruzstd::encoding::compress_to_vec(bytes, ruzstd::encoding::CompressionLevel::Fastest)
    }

    #[test]
    fn extract_anki_legacy_package_groups_cards_by_deck() {
        // Arrange

        let collection = legacy_collection_bytes();
        let package = build_package(&[("collection.anki2", &collection), ("media", b"{}")]);

        // Act

        let extraction = extract_anki(package).expect("expected extraction to succeed");

        // Assert

        let decks = extraction.decks;
        assert_eq!(1, decks.len());
        assert_eq!(vec!["Spanish", "Verbs"], decks[0].path);
        let fronts: Vec<&str> = decks[0].cards.iter().map(|c| c.front.as_str()).collect();
        assert_eq!(
            vec![
                "hablar",
                "<mark data-cloze-hidden=\"Madrid\">[...]</mark> is in Spain",
                "Madrid is in <mark data-cloze-hidden=\"Spain\">[...]</mark>",
            ],
            fronts
        );
        assert_eq!("to speak", decks[0].cards[0].back);
        assert_eq!(vec!["vocab"], decks[0].cards[0].tags);
    }

    #[test]
    fn extract_anki_current_format_prefers_compressed_collection() {
        // Arrange

        let collection = encode_zstd(&legacy_collection_bytes());
        let package = build_package(&[
            ("collection.anki2", b"stub asking to update Anki"),
            ("collection.anki21b", &collection),
        ]);

        // Act

        let extraction = extract_anki(package).expect("expected extraction to succeed");

        // Assert

        assert_eq!(3, extraction.decks[0].cards.len());
    }

    #[test]
    fn extract_anki_not_a_zip_returns_error() {
        // Arrange

        let bytes = b"not a package".to_vec();

        // Act

        let result = extract_anki(bytes);

        // Assert

        assert!(result.is_err());
    }

    #[test]
    fn extract_anki_image_occlusion_note_becomes_one_occlusion() {
        // Arrange

        let models = serde_json::json!({
            "30": {
                "name": "Image Occlusion", "type": 1,
                "flds": [
                    {"name": "Occlusion", "ord": 0}, {"name": "Image", "ord": 1},
                    {"name": "Header", "ord": 2}, {"name": "Back Extra", "ord": 3}
                ],
                "tmpls": [{
                    "name": "Image Occlusion", "ord": 0,
                    "qfmt": "<div style=\"display: none\">{{cloze:Occlusion}}</div><div id=\"image-occlusion-container\">{{Image}}</div>",
                    "afmt": "{{cloze:Occlusion}}{{Image}}<button id=\"toggle\">Toggle Masks</button>"
                }]
            }
        });
        let decks = serde_json::json!({"1": {"name": "Anatomy"}});
        let collection = build_legacy_collection(
            &models,
            &decks,
            "INSERT INTO notes VALUES (300, 30, ' heart ', '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}{{c2::image-occlusion:rect:left=.5:top=.5:width=.2:height=.2:oi=1}}\x1f<img src=\"heart.png\">\x1f<b>Heart</b>\x1f');
             INSERT INTO cards VALUES (1, 300, 1, 0, 0);
             INSERT INTO cards VALUES (2, 300, 1, 1, 0);",
        );
        let image = png(40, 20);
        let package = build_package(&[
            ("collection.anki2", &collection),
            ("media", br#"{"0": "heart.png"}"#),
            ("0", &image),
        ]);

        // Act

        let extraction = extract_anki(package).expect("expected extraction to succeed");

        // Assert

        let deck = &extraction.decks[0];
        assert!(deck.cards.is_empty());
        let [occlusion] = deck.image_occlusions.as_slice() else {
            panic!("expected the note's cards to become one occlusion");
        };
        assert_eq!("Heart", occlusion.name);
        assert_eq!((40, 20), (occlusion.image_width, occlusion.image_height));
        assert_eq!(AssetId::from_bytes(&image), occlusion.image_asset_id);
        assert_eq!(OcclusionMode::HideAllGuessOne, occlusion.mode);
        let targets: Vec<_> = occlusion
            .shapes
            .iter()
            .filter_map(|shape| shape.target_key())
            .collect();
        assert_eq!(vec!["c1", "c2"], targets);
        assert_eq!(vec!["heart"], occlusion.tags);
        assert_eq!(1, extraction.images.len());
    }

    #[test]
    fn extract_anki_enhanced_occlusion_notes_sharing_an_id_become_one_occlusion() {
        // Arrange

        let (package, image) = enhanced_occlusion_package();

        // Act

        let extraction = extract_anki(package).expect("expected extraction to succeed");

        // Assert

        let deck = &extraction.decks[0];
        assert!(deck.cards.is_empty());
        let [occlusion] = deck.image_occlusions.as_slice() else {
            panic!("expected both notes to become one occlusion");
        };
        assert_eq!("Row reduction", occlusion.name);
        assert_eq!(OcclusionMode::HideAllGuessOne, occlusion.mode);
        assert_eq!(AssetId::from_bytes(&image), occlusion.image_asset_id);
        let targets: Vec<_> = occlusion
            .shapes
            .iter()
            .filter_map(|shape| shape.target_key())
            .collect();
        assert_eq!(vec!["abc-ao-1", "abc-ao-2", "abc-ao-2"], targets);
        assert_eq!(1, extraction.images.len());
    }
}
