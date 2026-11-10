use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::{Captures, Regex};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::entities::anki_note::AnkiNote;
use super::entities::anki_notetype::AnkiNotetype;
use super::entities::exported_note::ExportedNote;
use super::occlusion::occlusion_field;
use crate::assets::entities::asset::Asset;
use crate::assets::value_objects::asset_id::{ASSET_SRC_PREFIX, AssetId};
use crate::common::utils::html::escape_html_text;
use crate::elements::entities::card::Card;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;

/// Cards outside any folder, and the parent deck of every folder made in Amber.
const ROOT_DECK: &str = "Amber";
/// What Anki splits a deck's name into its path on.
const DECK_SEPARATOR: &str = "::";
/// Bump when what Amber sends for the same content changes (its HTML, say), so every note is sent again.
pub const EXPORT_VERSION: i64 = 1;

static ASSET_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!("{ASSET_SRC_PREFIX}([0-9a-f]{{64}})")).expect("valid asset src regex")
});

/// A folder's name as one deck path segment; Anki splits deck names on `::`.
fn deck_segment(name: &str) -> String {
    name.replace(DECK_SEPARATOR, ":")
}

/// The card's folders as an Anki deck path, or `None` when an ancestor is trashed. See `deck_name_under`.
pub fn deck_name(
    card: &Card,
    metas: &HashMap<ElementId, Meta>,
    anki_decks: &HashMap<Uuid, String>,
) -> Option<String> {
    deck_name_under(card.meta.parent, metas, anki_decks)
}

/// The Anki deck of a card under `parent`. A folder the importer made from a deck keeps that deck's name
/// wherever it sits in Amber, and folders made in Amber below it become its subdecks; a tree made in Amber
/// goes under the `Amber` deck, so it never merges into a deck of Anki's own. `anki_decks` holds the deck
/// of each folder the importer made.
pub fn deck_name_under(
    parent: Option<ElementId>,
    metas: &HashMap<ElementId, Meta>,
    anki_decks: &HashMap<Uuid, String>,
) -> Option<String> {
    deck_path(parent, |id| metas.get(id), anki_decks).map(|path| path.join(DECK_SEPARATOR))
}

/// The deck path of whatever sits in `parent`, or `None` when an ancestor is trashed: the nearest imported
/// folder's deck, then the folders made in Amber below it. Anything above that folder is left out.
fn deck_path<'a>(
    mut parent: Option<ElementId>,
    meta_of: impl Fn(&ElementId) -> Option<&'a Meta>,
    anki_decks: &HashMap<Uuid, String>,
) -> Option<Vec<String>> {
    // Innermost first. The walk goes on past the deck only to check every ancestor is live.
    let mut folders = Vec::new();
    let mut deck = None;
    while let Some(id) = parent {
        let meta = meta_of(&id)?;
        if let (ElementId::Folder(folder), None) = (id, deck) {
            match anki_decks.get(&folder) {
                Some(name) => deck = Some(name),
                None => folders.push(deck_segment(&meta.name)),
            }
        }
        parent = meta.parent;
    }
    folders.reverse();
    let root: Vec<String> = match deck {
        Some(name) => name.split(DECK_SEPARATOR).map(str::to_string).collect(),
        None => vec![ROOT_DECK.to_string()],
    };
    Some(root.into_iter().chain(folders).collect())
}

/// The live folders by the deck path `deck_name_under` gives their cards, the way a deck's path splits.
/// An imported folder wins over a folder made in Amber at the same path; otherwise the first one does.
pub fn folder_paths(
    metas: &[Meta],
    anki_decks: &HashMap<Uuid, String>,
) -> HashMap<Vec<String>, ElementId> {
    let by_id: HashMap<ElementId, &Meta> = metas.iter().map(|m| (m.element_id, m)).collect();
    let meta_of = |id: &ElementId| by_id.get(id).copied();
    let (imported, made_in_amber): (Vec<&Meta>, Vec<&Meta>) = metas
        .iter()
        .filter(|meta| matches!(meta.element_id, ElementId::Folder(_)))
        .partition(|meta| anki_decks.contains_key(&meta.element_id.id()));
    let mut paths = HashMap::new();
    for meta in imported.into_iter().chain(made_in_amber) {
        if let Some(path) = deck_path(Some(meta.element_id), meta_of, anki_decks) {
            paths.entry(path).or_insert(meta.element_id);
        }
    }
    paths
}

/// Anki tags can't hold spaces.
pub fn anki_tags(tags: &[String]) -> Vec<String> {
    tags.iter()
        .map(|tag| tag.split_whitespace().collect::<Vec<_>>().join("_"))
        .collect()
}

pub fn basic_note(
    card: &Card,
    front: String,
    back: String,
    deck: String,
    tags: Vec<String>,
) -> AnkiNote {
    AnkiNote {
        guid: card.meta.element_id.id().hyphenated().to_string(),
        notetype: AnkiNotetype::Basic,
        fields: vec![front, back],
        tags,
        deck,
        modified: card.meta.modified_at.timestamp(),
        hidden_fields: Vec::new(),
        card_ords: vec![0],
    }
}

/// One note for the whole occlusion, a card per filled slot; `cards` are Amber's cards of it.
pub fn occlusion_note(
    occlusion: &ImageOcclusion,
    slots: &[Option<String>],
    cards: &[&Card],
    deck: String,
    tags: Vec<String>,
) -> AnkiNote {
    AnkiNote {
        guid: occlusion.id.hyphenated().to_string(),
        notetype: AnkiNotetype::ImageOcclusion,
        fields: vec![
            occlusion_field(occlusion, slots),
            format!("<img src=\"{}\">", occlusion.image_asset_id.src()),
            escape_html_text(&occlusion.name),
            String::new(),
            String::new(),
        ],
        tags,
        deck,
        modified: cards
            .iter()
            .map(|card| card.meta.modified_at.timestamp())
            .max()
            .unwrap_or(0),
        hidden_fields: vec![serde_json::to_string(slots).expect("strings serialize")],
        card_ords: slots
            .iter()
            .enumerate()
            .filter_map(|(ord, slot)| slot.as_ref().map(|_| ord))
            .collect(),
    }
}

/// A hash of what Anki's importer updates on a note it already has: fields, tags and cards. Taken before
/// a basic note's fields are rendered, so an unchanged note needn't be rendered at all.
pub fn fingerprint(note: &AnkiNote) -> String {
    let mut hasher = Sha256::new();
    let parts = [&note.fields, &note.hidden_fields, &note.tags];
    for part in parts {
        for value in part {
            hasher.update(value.as_bytes());
            hasher.update([0x1f]);
        }
        hasher.update([0x1e]);
    }
    for ord in &note.card_ords {
        hasher.update(ord.to_le_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Dates a note changed since it was last sent after that send, so Anki takes it even when what changed
/// (tags, masks, a folder rename) carries no timestamp of its own. Returns the record of this send.
pub fn resolve_modified(
    note: &mut AnkiNote,
    previous: Option<&ExportedNote>,
    fingerprint: String,
    now: i64,
) -> ExportedNote {
    if let Some(previous) = previous {
        note.modified = if previous.holds(&fingerprint) {
            note.modified.max(previous.modified)
        } else {
            note.modified.max(previous.modified + 1).max(now)
        };
    }
    ExportedNote {
        guid: note.guid.clone(),
        fingerprint,
        version: EXPORT_VERSION,
        deck: note.deck.clone(),
        modified: note.modified,
    }
}

/// The slots an occlusion note's `Amber Targets` field holds; none when it's missing or edited by hand.
pub fn parse_slots(field: &str) -> Vec<Option<String>> {
    serde_json::from_str(field).unwrap_or_default()
}

/// The asset ids the notes' images use.
pub fn asset_ids(notes: &[AnkiNote]) -> HashSet<String> {
    notes
        .iter()
        .flat_map(|note| &note.fields)
        .flat_map(|field| {
            ASSET_SRC
                .captures_iter(field)
                .map(|caps| caps[1].to_string())
        })
        .collect()
}

/// The filename an asset gets in Anki's media folder.
pub fn media_name(asset: &Asset) -> String {
    let subtype = asset.mime_type.split('/').nth(1).unwrap_or("bin");
    let extension = subtype.split('+').next().unwrap_or(subtype);
    format!("{}.{extension}", asset.id.as_str())
}

/// The asset a media file Amber sent is named after, by `media_name`.
pub fn sent_asset_id(filename: &str) -> Option<AssetId> {
    let (stem, _) = filename.split_once('.')?;
    AssetId::try_from(stem.to_string()).ok()
}

/// Points the notes' images at their media files; `names` maps asset id to filename.
pub fn use_media_names(notes: &mut [AnkiNote], names: &HashMap<String, String>) {
    for field in notes.iter_mut().flat_map(|note| note.fields.iter_mut()) {
        *field = ASSET_SRC
            .replace_all(field, |caps: &Captures| {
                names
                    .get(&caps[1])
                    .cloned()
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .into_owned();
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use uuid::Uuid;

    use super::*;
    use crate::elements::value_objects::name_source::NameSource;

    fn meta(element_id: ElementId, name: &str, parent: Option<ElementId>) -> Meta {
        Meta {
            element_id,
            name: name.into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            derived_from: None,
            study_profile_id: None,
            bibliographical_source_id: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    fn card(parent: Option<ElementId>) -> Card {
        Card {
            meta: meta(ElementId::Card(Uuid::new_v4()), "card", parent),
            front: String::new(),
            back: String::new(),
        }
    }

    /// Biology, holding Cells, holding an article.
    fn biology() -> (ElementId, ElementId, HashMap<ElementId, Meta>) {
        let biology = ElementId::Folder(Uuid::new_v4());
        let cells = ElementId::Folder(Uuid::new_v4());
        let article = ElementId::LearningAsset(Uuid::new_v4());
        let metas = HashMap::from([
            (biology, meta(biology, "Biology", None)),
            (cells, meta(cells, "Cells", Some(biology))),
            (article, meta(article, "Article", Some(cells))),
        ]);
        (biology, article, metas)
    }

    /// Each folder's Anki deck, as the importer records it.
    fn decks(folders: &[(ElementId, &str)]) -> HashMap<Uuid, String> {
        folders
            .iter()
            .map(|(folder, deck)| (folder.id(), deck.to_string()))
            .collect()
    }

    fn folder(name: &str, parent: Option<ElementId>) -> (ElementId, Meta) {
        let id = ElementId::Folder(Uuid::new_v4());
        (id, meta(id, name, parent))
    }

    #[test]
    fn deck_name_folders_made_in_amber_go_under_the_amber_deck() {
        // Arrange

        let (_, article, metas) = biology();

        // Act

        let deck = deck_name(&card(Some(article)), &metas, &HashMap::new());

        // Assert

        assert_eq!(Some("Amber::Biology::Cells".to_string()), deck);
    }

    #[test]
    fn deck_name_tree_imported_from_anki_keeps_its_deck() {
        // Arrange

        let (biology, article, metas) = biology();
        let cells = metas[&article].parent.unwrap();
        let anki_decks = decks(&[(biology, "Biology"), (cells, "Biology::Cells")]);

        // Act

        let deck = deck_name(&card(Some(article)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Biology::Cells".to_string()), deck);
    }

    #[test]
    fn deck_name_imported_tree_moved_into_nested_folders_made_in_amber_keeps_its_deck() {
        // Arrange

        let (languages, languages_meta) = folder("Languages", None);
        let (romance, romance_meta) = folder("Romance", Some(languages));
        let (spanish, spanish_meta) = folder("Spanish", Some(romance));
        let (verbs, verbs_meta) = folder("Verbs", Some(spanish));
        let metas = HashMap::from([
            (languages, languages_meta),
            (romance, romance_meta),
            (spanish, spanish_meta),
            (verbs, verbs_meta),
        ]);
        let anki_decks = decks(&[(spanish, "Spanish"), (verbs, "Spanish::Verbs")]);

        // Act

        let deck = deck_name(&card(Some(verbs)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Spanish::Verbs".to_string()), deck);
    }

    #[test]
    fn deck_name_subdeck_moved_out_of_its_deck_keeps_its_deck() {
        // Arrange

        let (grammar, grammar_meta) = folder("Grammar", None);
        let (spanish, spanish_meta) = folder("Spanish", None);
        let (verbs, verbs_meta) = folder("Verbs", Some(grammar));
        let metas = HashMap::from([
            (grammar, grammar_meta),
            (spanish, spanish_meta),
            (verbs, verbs_meta),
        ]);
        let anki_decks = decks(&[(spanish, "Spanish"), (verbs, "Spanish::Verbs")]);

        // Act

        let deck = deck_name(&card(Some(verbs)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Spanish::Verbs".to_string()), deck);
    }

    #[test]
    fn deck_name_folder_made_in_amber_between_a_deck_and_its_subdeck_left_out() {
        // Arrange

        let (spanish, spanish_meta) = folder("Spanish", None);
        let (notes, notes_meta) = folder("My notes", Some(spanish));
        let (verbs, verbs_meta) = folder("Verbs", Some(notes));
        let metas = HashMap::from([
            (spanish, spanish_meta),
            (notes, notes_meta),
            (verbs, verbs_meta),
        ]);
        let anki_decks = decks(&[(spanish, "Spanish"), (verbs, "Spanish::Verbs")]);

        // Act

        let deck = deck_name(&card(Some(verbs)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Spanish::Verbs".to_string()), deck);
    }

    #[test]
    fn deck_name_deck_moved_inside_another_deck_keeps_its_own() {
        // Arrange

        let (spanish, spanish_meta) = folder("Spanish", None);
        let (french, french_meta) = folder("French", Some(spanish));
        let metas = HashMap::from([(spanish, spanish_meta), (french, french_meta)]);
        let anki_decks = decks(&[(spanish, "Spanish"), (french, "French")]);

        // Act

        let deck = deck_name(&card(Some(french)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("French".to_string()), deck);
    }

    #[test]
    fn deck_name_folder_made_in_amber_inside_a_deck_becomes_its_subdeck() {
        // Arrange

        let (anki, anki_meta) = folder("Anki", None);
        let (spanish, spanish_meta) = folder("Spanish", Some(anki));
        let (notes, notes_meta) = folder("My notes", Some(spanish));
        let metas = HashMap::from([
            (anki, anki_meta),
            (spanish, spanish_meta),
            (notes, notes_meta),
        ]);
        let anki_decks = decks(&[(spanish, "Spanish")]);

        // Act

        let deck = deck_name(&card(Some(notes)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Spanish::My notes".to_string()), deck);
    }

    #[test]
    fn deck_name_imported_folder_renamed_in_amber_keeps_its_deck() {
        // Arrange

        let (spanish, spanish_meta) = folder("Español", None);
        let metas = HashMap::from([(spanish, spanish_meta)]);
        let anki_decks = decks(&[(spanish, "Spanish")]);

        // Act

        let deck = deck_name(&card(Some(spanish)), &metas, &anki_decks);

        // Assert

        assert_eq!(Some("Spanish".to_string()), deck);
    }

    #[test]
    fn folder_paths_decks_spread_across_folders_made_in_amber_found_at_their_decks() {
        // Arrange

        let (anki, anki_meta) = folder("Anki", None);
        let (grammar, grammar_meta) = folder("Grammar", Some(anki));
        let (spanish, spanish_meta) = folder("Spanish", Some(anki));
        let (verbs, verbs_meta) = folder("Verbs", Some(grammar));
        let (japanese, japanese_meta) = folder("Japanese", None);
        let metas = [
            anki_meta,
            grammar_meta,
            spanish_meta,
            verbs_meta,
            japanese_meta,
        ];
        let anki_decks = decks(&[
            (spanish, "Spanish"),
            (verbs, "Spanish::Verbs"),
            (japanese, "Japanese"),
        ]);

        // Act

        let paths = folder_paths(&metas, &anki_decks);

        // Assert

        let path = |deck: &str| deck.split("::").map(str::to_string).collect::<Vec<_>>();
        let expected = HashMap::from([
            (path("Amber::Anki"), anki),
            (path("Amber::Anki::Grammar"), grammar),
            (path("Spanish"), spanish),
            (path("Spanish::Verbs"), verbs),
            (path("Japanese"), japanese),
        ]);
        assert_eq!(expected, paths);
    }

    #[test]
    fn folder_paths_imported_folder_wins_over_one_made_in_amber_at_the_same_path() {
        // Arrange

        let (made_in_amber, made_in_amber_meta) = folder("Spanish", None);
        let (spanish, spanish_meta) = folder("Spanish", Some(made_in_amber));
        let metas = [made_in_amber_meta, spanish_meta];
        let anki_decks = decks(&[(spanish, "Amber::Spanish")]);

        // Act

        let paths = folder_paths(&metas, &anki_decks);

        // Assert

        let path = vec!["Amber".to_string(), "Spanish".to_string()];
        assert_eq!(Some(&spanish), paths.get(&path));
    }

    #[test]
    fn deck_name_card_outside_any_folder_goes_to_the_amber_deck() {
        // Act

        let deck = deck_name(&card(None), &HashMap::new(), &HashMap::new());

        // Assert

        assert_eq!(Some("Amber".to_string()), deck);
    }

    #[test]
    fn folder_paths_folder_under_trashed_parent_left_out() {
        // Arrange

        let (biology, biology_meta) = folder("Biology", None);
        let (_, in_trash) = folder("Old", Some(ElementId::Folder(Uuid::new_v4())));
        let metas = [biology_meta, in_trash];

        // Act

        let paths = folder_paths(&metas, &decks(&[(biology, "Biology")]));

        // Assert

        assert_eq!(
            HashMap::from([(vec!["Biology".to_string()], biology)]),
            paths
        );
    }

    #[test]
    fn folder_paths_folder_made_in_amber_found_under_the_amber_deck() {
        // Arrange

        let folder = ElementId::Folder(Uuid::new_v4());
        let metas = [meta(folder, "Biology", None)];

        // Act

        let paths = folder_paths(&metas, &HashMap::new());

        // Assert

        let path = vec!["Amber".to_string(), "Biology".to_string()];
        assert_eq!(HashMap::from([(path, folder)]), paths);
    }

    #[test]
    fn folder_paths_name_with_deck_separator_matches_its_deck_name() {
        // Arrange

        let folder = ElementId::Folder(Uuid::new_v4());
        let metas = [meta(folder, "C++::STL", None)];
        let by_id = HashMap::from([(folder, metas[0].clone())]);
        let deck = deck_name(&card(Some(folder)), &by_id, &HashMap::new()).unwrap();

        // Act

        let paths = folder_paths(&metas, &HashMap::new());

        // Assert

        let path: Vec<String> = deck.split("::").map(str::to_string).collect();
        assert_eq!(Some(&folder), paths.get(&path));
    }

    #[test]
    fn deck_name_trashed_ancestor_returns_none() {
        // Arrange

        let trashed = ElementId::Folder(Uuid::new_v4());

        // Act

        let deck = deck_name(&card(Some(trashed)), &HashMap::new(), &HashMap::new());

        // Assert

        assert_eq!(None, deck);
    }

    fn sent(note: &AnkiNote, modified: i64) -> ExportedNote {
        ExportedNote {
            guid: note.guid.clone(),
            fingerprint: fingerprint(note),
            version: EXPORT_VERSION,
            deck: note.deck.clone(),
            modified,
        }
    }

    #[test]
    fn resolve_modified_tags_changed_since_last_send_dates_note_now() {
        // Arrange

        let card = card(None);
        let previous = sent(
            &basic_note(
                &card,
                "front".into(),
                "back".into(),
                ROOT_DECK.into(),
                Vec::new(),
            ),
            100,
        );
        let mut note = basic_note(
            &card,
            "front".into(),
            "back".into(),
            ROOT_DECK.into(),
            vec!["verbs".into()],
        );
        note.modified = 50;

        // Act

        let note_fingerprint = fingerprint(&note);
        let record = resolve_modified(&mut note, Some(&previous), note_fingerprint, 200);

        // Assert

        assert_eq!(200, note.modified);
        assert_eq!(200, record.modified);
        assert_ne!(previous.fingerprint, record.fingerprint);
    }

    #[test]
    fn resolve_modified_unchanged_note_keeps_last_sent_time() {
        // Arrange

        let mut note = basic_note(
            &card(None),
            "front".into(),
            "back".into(),
            ROOT_DECK.into(),
            Vec::new(),
        );
        note.modified = 50;
        let previous = sent(&note, 100);

        // Act

        let note_fingerprint = fingerprint(&note);
        resolve_modified(&mut note, Some(&previous), note_fingerprint, 200);

        // Assert

        assert_eq!(100, note.modified);
    }

    #[test]
    fn resolve_modified_never_sent_keeps_own_time() {
        // Arrange

        let mut note = basic_note(
            &card(None),
            "front".into(),
            "back".into(),
            ROOT_DECK.into(),
            Vec::new(),
        );
        note.modified = 50;

        // Act

        let note_fingerprint = fingerprint(&note);
        resolve_modified(&mut note, None, note_fingerprint, 200);

        // Assert

        assert_eq!(50, note.modified);
    }

    #[test]
    fn sent_asset_id_media_name_returns_its_asset() {
        // Arrange

        let asset = Asset {
            id: AssetId::from_bytes(b"png"),
            mime_type: "image/png".into(),
            data: Vec::new(),
        };

        // Act

        let id = sent_asset_id(&media_name(&asset));

        // Assert

        assert_eq!(Some(asset.id), id);
        assert_eq!(None, sent_asset_id("cat.png"));
    }

    #[test]
    fn use_media_names_asset_src_becomes_media_filename() {
        // Arrange

        let asset = Asset {
            id: AssetId::from_bytes(b"png"),
            mime_type: "image/svg+xml".into(),
            data: Vec::new(),
        };
        let mut notes = vec![basic_note(
            &card(None),
            format!("<img src=\"{}\">", asset.id.src()),
            String::new(),
            ROOT_DECK.into(),
            Vec::new(),
        )];
        let names = HashMap::from([(asset.id.as_str().to_string(), media_name(&asset))]);

        // Act

        let ids = asset_ids(&notes);
        use_media_names(&mut notes, &names);

        // Assert

        assert!(ids.contains(asset.id.as_str()));
        assert_eq!(
            format!("<img src=\"{}.svg\">", asset.id.as_str()),
            notes[0].fields[0]
        );
    }
}
