use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::{AMBER_NOTES_QUERY, ANKI_CARDS_QUERY, DefaultAnkiSyncService, FILTERED_CARDS_QUERY};
use crate::anki_sync::anki_connect::{
    AnkiNoteInfo, cards_info, decks_of_cards, delete_notes, find_cards, find_notes, notes_info,
    suspend_cards,
};
use crate::anki_sync::entities::anki_notetype::AnkiNotetype;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::notes::parse_slots;
use crate::anki_sync::package::definitions::{
    AMBER_ID_FIELD, AMBER_TARGETS_FIELD, BASIC_BACK_FIELD, BASIC_FRONT_FIELD,
};
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::anki_sync::services::sync_frontend::AnkiSyncStage;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::import::anki::entities::anki_card_link::AnkiCardLink;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;

const DECK_SEPARATOR: &str = "::";
/// How long before the last sync an edit may have been made on another device and still be found, once
/// Anki's own sync brings it here.
const LATE_EDIT_DAYS: i64 = 7;
const CARDS_TABLE: &str = "cards";
/// The tables whose rows Amber's notes are made from: a basic note per card, one note per occlusion.
const NOTE_SOURCE_TABLES: [&str; 2] = [CARDS_TABLE, "image_occlusions"];

impl SyncPlan {
    /// Amber's cards Anki already holds, with their Anki card: those paired, and basic cards whose note
    /// Anki has though they weren't paired, such as one restored from the trash. The sync pairs those again.
    pub(super) fn cards_in_anki(&self) -> HashMap<Uuid, AnkiCardId> {
        let mut cards = self.held_by_anki.clone();
        cards.extend(&self.paired);
        cards
    }
}

/// The card of each of Amber's basic notes in Anki, by the Amber card in its id field.
fn held_by_anki(amber_notes: &[AnkiNoteInfo]) -> HashMap<Uuid, AnkiCardId> {
    amber_notes
        .iter()
        .filter(|info| info.field(AMBER_TARGETS_FIELD).is_none())
        .filter_map(|info| {
            let card_id = Uuid::parse_str(info.field(AMBER_ID_FIELD)?).ok()?;
            Some((card_id, *info.cards.first()?))
        })
        .collect()
}

/// Each occlusion note's cloze slots, by guid.
pub(super) type SlotsByGuid = HashMap<String, Vec<Option<String>>>;

/// What a sync would change, worked out before it changes anything.
pub(super) struct SyncPlan {
    pub(super) profile: String,
    pub(super) is_first_sync: bool,
    /// The cards Amber doesn't have, by top-level deck.
    pub(super) new_cards: BTreeMap<String, HashSet<AnkiCardId>>,
    pub(super) choices: HashMap<String, bool>,
    /// The cloze slots of Amber's occlusion notes as Anki holds them.
    pub(super) previous_slots: SlotsByGuid,
    /// Every card Anki holds.
    pub(super) existing_cards: HashSet<AnkiCardId>,
    /// This profile's pairs from its last sync whose Anki card still exists, by Amber card.
    pub(super) paired: HashMap<Uuid, AnkiCardId>,
    /// The Anki card of each of Amber's basic cards whose note Anki holds, paired or not.
    pub(super) held_by_anki: HashMap<Uuid, AnkiCardId>,
    /// Cards deleted in Anki, which go to Amber's trash.
    pub(super) cards_to_trash: Vec<Uuid>,
    /// Notes whose cards were all deleted in Amber.
    pub(super) notes_to_delete: Vec<AnkiNoteId>,
    /// Guids of those notes that came from Amber.
    pub(super) guids_to_forget: Vec<String>,
    /// Cards deleted in Amber whose note lives on through its other cards.
    pub(super) cards_to_suspend: Vec<AnkiCardId>,
    /// Amber's basic cards whose note was edited in Anki since Amber last sent it.
    pub(super) edited_in_anki: Vec<AnkiEdit>,
    /// Amber's occlusion notes edited in Anki since last sent, by guid, with Anki's time of the edit.
    /// Amber draws occlusions, so its version is sent again over the edit.
    pub(super) occlusions_edited_in_anki: HashMap<String, i64>,
    /// Imported cards whose note changed in Anki since the last sync, as Anki card to Amber card, by
    /// top-level deck.
    pub(super) imported_changed_in_anki: BTreeMap<String, HashMap<AnkiCardId, Uuid>>,
    /// Imported occlusions whose note changed in Anki since the last sync, by top-level deck.
    pub(super) imported_occlusions_changed_in_anki: BTreeMap<String, Vec<OcclusionChange>>,
    /// The fields hash of each of those cards' notes, saved once they're refreshed.
    pub(super) imported_note_hashes: Vec<(AnkiNoteId, String)>,
}

/// Imported cards whose note's fields changed in Anki, and the notes' new fields hashes.
#[derive(Default)]
struct ImportedChanges {
    by_deck: BTreeMap<String, HashMap<AnkiCardId, Uuid>>,
    occlusions: BTreeMap<String, Vec<OcclusionChange>>,
    hashes: Vec<(AnkiNoteId, String)>,
}

/// An imported occlusion whose note's fields changed in Anki, so Amber takes its masks from the note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct OcclusionChange {
    pub(super) occlusion_id: Uuid,
    /// Every card of the note: those Amber has, and those of masks added in Anki.
    pub(super) anki_cards: HashSet<AnkiCardId>,
    /// How many of the note's cards Amber has, counted as edited in Anki.
    pub(super) amber_cards: usize,
}

/// Only Anki's own occlusions keep every mask in one note; the add-on's spread one per note.
fn is_native_occlusion(info: &AnkiNoteInfo) -> bool {
    info.fields
        .values()
        .any(|field| field.value.contains("image-occlusion:"))
}

/// A hash of a note's fields, which is what Amber renders an imported card from.
pub(super) fn fields_hash(info: &AnkiNoteInfo) -> String {
    let fields: BTreeMap<&String, &str> = info
        .fields
        .iter()
        .map(|(name, field)| (name, field.value.as_str()))
        .collect();
    let mut hasher = Sha256::new();
    for (name, value) in fields {
        hasher.update(name.as_bytes());
        hasher.update([0x1f]);
        hasher.update(value.as_bytes());
        hasher.update([0x1e]);
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// An Amber card's note as Anki holds it after an edit there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AnkiEdit {
    pub(super) card_id: Uuid,
    pub(super) front: String,
    pub(super) back: String,
    /// What Amber last sent the note as, to tell whether Amber changed the card since.
    pub(super) sent_fingerprint: String,
    /// When Anki's edit was made, in Unix seconds.
    pub(super) modified: i64,
}

/// Basic notes Anki changed after Amber sent them: an import keeps the time Amber gave, so a later one is
/// an edit. Notes of cards trashed in Amber are left out.
fn edited_in_anki(
    notes: &[AnkiNoteInfo],
    sent: &HashMap<String, ExportedNote>,
    live_cards: &HashSet<Uuid>,
) -> Vec<AnkiEdit> {
    let basic = AnkiNotetype::Basic.definition().1;
    notes
        .iter()
        .filter(|info| info.model_name == basic)
        .filter_map(|info| {
            let guid = info.field(AMBER_ID_FIELD)?;
            let card_id = Uuid::parse_str(guid).ok()?;
            let sent = sent.get(guid)?;
            (info.modified > sent.modified && live_cards.contains(&card_id)).then(|| AnkiEdit {
                card_id,
                front: info
                    .field(BASIC_FRONT_FIELD)
                    .unwrap_or_default()
                    .to_string(),
                back: info.field(BASIC_BACK_FIELD).unwrap_or_default().to_string(),
                sent_fingerprint: sent.fingerprint.clone(),
                modified: info.modified,
            })
        })
        .collect()
}

fn occlusions_edited_in_anki(
    notes: &[AnkiNoteInfo],
    sent: &HashMap<String, ExportedNote>,
) -> HashMap<String, i64> {
    let occlusion = AnkiNotetype::ImageOcclusion.definition().1;
    notes
        .iter()
        .filter(|info| info.model_name == occlusion)
        .filter_map(|info| {
            let guid = info.field(AMBER_ID_FIELD)?;
            let sent = sent.get(guid)?;
            (info.modified > sent.modified).then(|| (guid.to_string(), info.modified))
        })
        .collect()
}

/// Cards with no trashed ancestor; `metas` holds only elements not trashed themselves.
fn live_cards(metas: &[Meta]) -> HashSet<Uuid> {
    let by_id: HashMap<ElementId, &Meta> = metas.iter().map(|m| (m.element_id, m)).collect();
    let has_live_ancestors = |meta: &Meta| {
        let mut parent = meta.parent;
        while let Some(id) = parent {
            let Some(ancestor) = by_id.get(&id) else {
                return false;
            };
            parent = ancestor.parent;
        }
        true
    };
    metas
        .iter()
        .filter(|meta| matches!(meta.element_id, ElementId::Card(_)) && has_live_ancestors(meta))
        .map(|meta| meta.element_id.id())
        .collect()
}

/// Anki's side of the cards deleted in Amber.
struct AmberDeletions {
    /// Notes left with no card.
    notes_to_delete: Vec<AnkiNoteId>,
    /// Cards of notes that keep others.
    cards_to_suspend: Vec<AnkiCardId>,
}

impl DefaultAnkiSyncService {
    /// Reads both sides and works out what a sync would do, changing nothing.
    pub(super) async fn plan(&self, profile: String) -> Result<SyncPlan, AnkiSyncError> {
        let repository = &self.anki_sync_repository;
        let links = self.anki_card_link_repository.get_all().await?;
        let paired = repository.get_paired_cards(&profile).await?;
        let choices = repository.get_deck_choices(&profile).await?;
        let skipped = repository.get_skipped_cards(&profile).await?;
        let last_synced = repository.get_last_synced(&profile).await?;
        let is_first_sync = last_synced.is_none();
        let metas = self.meta_repository.get_all_ordered_by_priority().await?;
        let live_cards = live_cards(&metas);

        let anki_cards = self.find_card_set(ANKI_CARDS_QUERY).await?;
        let amber_cards = self.find_card_set(AMBER_NOTES_QUERY).await?;
        let found = find_notes(self.client(), AMBER_NOTES_QUERY).await?;
        let amber_notes = notes_info(self.client(), &found).await?;
        let sent = self.exported_notes(&profile).await?;
        let edited_in_anki = edited_in_anki(&amber_notes, &sent, &live_cards);
        let occlusions_edited_in_anki = occlusions_edited_in_anki(&amber_notes, &sent);
        let imported = match last_synced {
            Some(since) => {
                self.imported_changed_since(&profile, since, &links, &live_cards)
                    .await?
            }
            None => ImportedChanges::default(),
        };

        // A mask added in Anki to an imported occlusion comes with the occlusion, not as a new card.
        let occlusion_cards = imported
            .occlusions
            .values()
            .flatten()
            .flat_map(|change| change.anki_cards.iter().copied());
        let known: HashSet<AnkiCardId> = links
            .iter()
            .map(|link| link.anki_card_id)
            .chain(skipped)
            .chain(occlusion_cards)
            .collect();
        let new_cards = self
            .new_cards_by_deck(anki_cards.difference(&known).copied().collect())
            .await?;

        // A pair only exists for this profile, so opening another one can't look like a mass deletion.
        let cards_to_trash: Vec<Uuid> = paired
            .iter()
            .filter(|pair| {
                !anki_cards.contains(&pair.anki_card_id)
                    && !amber_cards.contains(&pair.anki_card_id)
                    && live_cards.contains(&pair.card_id)
            })
            .map(|pair| pair.card_id)
            .collect();

        let AmberDeletions {
            mut notes_to_delete,
            cards_to_suspend,
        } = self.deleted_in_amber(&links, &anki_cards).await?;
        let deleted_sources = self.deleted_note_sources(&amber_notes).await?;
        let mut guids_to_forget = Vec::new();
        for info in &amber_notes {
            let guid = info.field(AMBER_ID_FIELD).unwrap_or_default();
            if Uuid::parse_str(guid).is_ok_and(|id| deleted_sources.contains(&id)) {
                notes_to_delete.push(info.note_id);
                guids_to_forget.push(guid.to_string());
            }
        }
        let existing_cards: HashSet<AnkiCardId> = anki_cards.union(&amber_cards).copied().collect();
        let held_by_anki = held_by_anki(&amber_notes);

        Ok(SyncPlan {
            profile,
            is_first_sync,
            new_cards,
            choices,
            previous_slots: previous_slots(&amber_notes),
            cards_to_trash,
            notes_to_delete,
            guids_to_forget,
            cards_to_suspend,
            edited_in_anki,
            occlusions_edited_in_anki,
            imported_changed_in_anki: imported.by_deck,
            imported_occlusions_changed_in_anki: imported.occlusions,
            imported_note_hashes: imported.hashes,
            paired: paired
                .iter()
                .filter(|pair| existing_cards.contains(&pair.anki_card_id))
                .map(|pair| (pair.card_id, pair.anki_card_id))
                .collect(),
            existing_cards,
            held_by_anki,
        })
    }

    /// Reports the deletions and trashes the cards deleted in Anki.
    pub(super) async fn trash_cards_deleted_in_anki(
        &self,
        plan: &SyncPlan,
    ) -> Result<(), AnkiSyncError> {
        let total = plan.cards_to_trash.len() + plan.notes_to_delete.len();
        if total > 0 {
            self.sync_frontend
                .report_progress(AnkiSyncStage::Deleting, 0, total);
        }
        let cards = plan.cards_to_trash.iter().copied().map(ElementId::Card);
        self.trash_service.trash_many(cards.collect()).await?;
        Ok(())
    }

    /// Deletes the notes of cards deleted in Amber from Anki, or suspends the cards while their note lives on.
    pub(super) async fn remove_cards_deleted_in_amber(
        &self,
        plan: &SyncPlan,
    ) -> Result<(), AnkiSyncError> {
        if !plan.notes_to_delete.is_empty() {
            delete_notes(self.client(), &plan.notes_to_delete).await?;
        }
        if !plan.cards_to_suspend.is_empty() {
            suspend_cards(self.client(), &plan.cards_to_suspend).await?;
        }
        Ok(())
    }

    /// Amber never writes to the notes of cards it imported, so one whose fields no longer match the hash
    /// Amber keeps was edited in Anki; a tag or deck change leaves the card as it was. The hash decides
    /// rather than the note's time, as an edit made on another device before `since` can arrive after it.
    /// A note without a hash counts when it changed since `since`. Filtered cards wait.
    async fn imported_changed_since(
        &self,
        profile: &str,
        since: DateTime<Utc>,
        links: &[AnkiCardLink],
        live_cards: &HashSet<Uuid>,
    ) -> Result<ImportedChanges, AnkiSyncError> {
        let mut changes = ImportedChanges::default();
        let days = edited_days(since, Utc::now()) + LATE_EDIT_DAYS;
        let query = format!("edited:{days} {ANKI_CARDS_QUERY}");
        let notes = find_notes(self.client(), &query).await?;
        if notes.is_empty() {
            return Ok(changes);
        }
        let occlusion_of: HashMap<Uuid, Uuid> = self
            .image_occlusion_repository
            .get_all_links()
            .await?
            .into_iter()
            .map(|link| (link.card_id, link.occlusion_id))
            .collect();
        let live_links = links
            .iter()
            .filter(|link| live_cards.contains(&link.card_id));
        let (occluded, basic): (Vec<&AnkiCardLink>, Vec<&AnkiCardLink>) =
            live_links.partition(|link| occlusion_of.contains_key(&link.card_id));
        let linked: HashMap<AnkiCardId, Uuid> = basic
            .iter()
            .map(|link| (link.anki_card_id, link.card_id))
            .collect();
        let occluded: HashMap<AnkiCardId, Uuid> = occluded
            .iter()
            .map(|link| (link.anki_card_id, occlusion_of[&link.card_id]))
            .collect();
        let filtered = self.find_card_set(FILTERED_CARDS_QUERY).await?;
        let infos: Vec<AnkiNoteInfo> = notes_info(self.client(), &notes)
            .await?
            .into_iter()
            .filter(|info| {
                info.cards
                    .iter()
                    .any(|card| linked.contains_key(card) || occluded.contains_key(card))
            })
            .collect();
        let ids: Vec<AnkiNoteId> = infos.iter().map(|info| info.note_id).collect();
        let previous = self
            .anki_sync_repository
            .get_imported_note_hashes(profile, &ids)
            .await?;
        let mut changed: HashMap<AnkiCardId, Uuid> = HashMap::new();
        let mut occlusions: Vec<(AnkiCardId, OcclusionChange)> = Vec::new();
        for info in &infos {
            let hash = fields_hash(info);
            let fields_changed = match previous.get(&info.note_id) {
                Some(previous) => *previous != hash,
                None => info.modified > since.timestamp(),
            };
            if !fields_changed {
                continue;
            }
            if let Some(occlusion_id) = info.cards.iter().find_map(|card| occluded.get(card)) {
                // Waits for a filtered deck to give a card back, as one left out would read as removed.
                if !is_native_occlusion(info) || info.cards.iter().any(|c| filtered.contains(c)) {
                    continue;
                }
                let change = OcclusionChange {
                    occlusion_id: *occlusion_id,
                    anki_cards: info.cards.iter().copied().collect(),
                    amber_cards: info
                        .cards
                        .iter()
                        .filter(|c| occluded.contains_key(c))
                        .count(),
                };
                occlusions.push((info.cards[0], change));
                changes.hashes.push((info.note_id, hash));
                continue;
            }
            changed.extend(
                info.cards
                    .iter()
                    .filter(|card| !filtered.contains(card))
                    .filter_map(|card| linked.get(card).map(|id| (*card, *id))),
            );
            // Saved with the refresh, so one that skips a filtered card is checked again.
            if !info.cards.iter().any(|card| filtered.contains(card)) {
                changes.hashes.push((info.note_id, hash));
            }
        }
        if changed.is_empty() && occlusions.is_empty() {
            return Ok(changes);
        }
        let cards: Vec<AnkiCardId> = changed
            .keys()
            .copied()
            .chain(occlusions.iter().map(|(card, _)| *card))
            .collect();
        for (deck, deck_cards) in decks_of_cards(self.client(), &cards).await? {
            let deck = top_level_deck(&deck).to_string();
            let basic: HashMap<AnkiCardId, Uuid> = deck_cards
                .iter()
                .filter_map(|card| Some((*card, *changed.get(card)?)))
                .collect();
            if !basic.is_empty() {
                changes
                    .by_deck
                    .entry(deck.clone())
                    .or_default()
                    .extend(basic);
            }
            for (_, change) in occlusions
                .iter()
                .filter(|(card, _)| deck_cards.contains(card))
            {
                changes
                    .occlusions
                    .entry(deck.clone())
                    .or_default()
                    .push(change.clone());
            }
        }
        Ok(changes)
    }

    pub(super) async fn find_card_set(
        &self,
        query: &str,
    ) -> Result<HashSet<AnkiCardId>, AnkiSyncError> {
        Ok(find_cards(self.client(), query)
            .await?
            .into_iter()
            .collect())
    }

    /// Leaves out cards in a filtered deck, which come over once they're back in their own deck: Anki's
    /// package of that deck doesn't hold them, and the filtered deck isn't one to ask the user about.
    async fn new_cards_by_deck(
        &self,
        mut cards: Vec<AnkiCardId>,
    ) -> Result<BTreeMap<String, HashSet<AnkiCardId>>, AnkiSyncError> {
        let mut by_deck: BTreeMap<String, HashSet<AnkiCardId>> = BTreeMap::new();
        if cards.is_empty() {
            return Ok(by_deck);
        }
        let filtered = self.find_card_set(FILTERED_CARDS_QUERY).await?;
        cards.retain(|card| !filtered.contains(card));
        if cards.is_empty() {
            return Ok(by_deck);
        }
        for (deck, cards) in decks_of_cards(self.client(), &cards).await? {
            by_deck
                .entry(top_level_deck(&deck).to_string())
                .or_default()
                .extend(cards);
        }
        Ok(by_deck)
    }

    /// Only a tombstone proves a deletion; a card still in the trash isn't one.
    async fn deleted_in_amber(
        &self,
        links: &[AnkiCardLink],
        anki_cards: &HashSet<AnkiCardId>,
    ) -> Result<AmberDeletions, AnkiSyncError> {
        let card_ids = links.iter().map(|link| link.card_id);
        let tombstones = self
            .sync_store
            .deleted_uuid_rows(CARDS_TABLE, card_ids)
            .await?;
        let mut deleted = HashSet::new();
        let mut kept = HashSet::new();
        for link in links {
            if tombstones.contains(&link.card_id) {
                deleted.insert(link.anki_card_id);
            } else {
                kept.insert(link.anki_card_id);
            }
        }
        let deleted: Vec<AnkiCardId> = deleted
            .difference(&kept)
            .filter(|card| anki_cards.contains(card))
            .copied()
            .collect();
        let mut deletions = AmberDeletions {
            notes_to_delete: Vec::new(),
            cards_to_suspend: Vec::new(),
        };
        if deleted.is_empty() {
            return Ok(deletions);
        }

        let notes: BTreeSet<AnkiNoteId> = cards_info(self.client(), &deleted)
            .await?
            .into_iter()
            .map(|info| info.note)
            .collect();
        let notes: Vec<AnkiNoteId> = notes.into_iter().collect();
        let gone: HashSet<AnkiCardId> = deleted.iter().copied().collect();
        for info in notes_info(self.client(), &notes).await? {
            if info.cards.iter().all(|card| gone.contains(card)) {
                deletions.notes_to_delete.push(info.note_id);
            } else {
                let cards = info.cards.iter().filter(|card| gone.contains(card));
                deletions.cards_to_suspend.extend(cards);
            }
        }
        Ok(deletions)
    }

    /// The notes' Amber sources that were deleted. Only a tombstone proves Amber deleted one: a note made in
    /// Anki, or one another device exported before cloud sync brought its card here, has none and stays.
    async fn deleted_note_sources(
        &self,
        notes: &[AnkiNoteInfo],
    ) -> Result<HashSet<Uuid>, AnkiSyncError> {
        let ids: Vec<Uuid> = notes
            .iter()
            .filter_map(|info| Uuid::parse_str(info.field(AMBER_ID_FIELD)?).ok())
            .collect();
        let mut deleted = HashSet::new();
        for table in NOTE_SOURCE_TABLES {
            let ids = ids.iter().copied();
            deleted.extend(self.sync_store.deleted_uuid_rows(table, ids).await?);
        }
        Ok(deleted)
    }
}

/// Each occlusion note's cloze slots as Anki holds them, by guid.
fn previous_slots(notes: &[AnkiNoteInfo]) -> SlotsByGuid {
    notes
        .iter()
        .filter_map(|info| {
            let guid = info.field(AMBER_ID_FIELD)?.to_string();
            Some((guid, parse_slots(info.field(AMBER_TARGETS_FIELD)?)))
        })
        .collect()
}

/// The days an `edited:` search must reach back to find every note changed since `since`. Anki counts
/// them back from the end of its today, so a day more than the time passed is needed to cover it.
fn edited_days(since: DateTime<Utc>, now: DateTime<Utc>) -> i64 {
    (now - since).num_days() + 2
}

fn top_level_deck(deck: &str) -> &str {
    deck.split(DECK_SEPARATOR).next().unwrap_or(deck)
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use fractional_index::FractionalIndex;

    use super::*;
    use crate::elements::value_objects::name_source::NameSource;

    fn meta(element_id: ElementId, parent: Option<ElementId>) -> Meta {
        Meta {
            element_id,
            name: String::new(),
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

    #[test]
    fn edited_days_synced_late_yesterday_reaches_back_past_today() {
        // Arrange

        let now = Utc::now();
        let since = now - Duration::hours(20);

        // Act

        let days = edited_days(since, now);

        // Assert

        assert_eq!(2, days);
    }

    #[test]
    fn live_cards_card_under_trashed_folder_is_left_out() {
        // Arrange

        let folder = ElementId::Folder(Uuid::new_v4());
        let trashed = ElementId::Folder(Uuid::new_v4());
        let kept = ElementId::Card(Uuid::new_v4());
        let metas = [
            meta(folder, None),
            meta(kept, Some(folder)),
            meta(ElementId::Card(Uuid::new_v4()), Some(trashed)),
        ];

        // Act

        let live = live_cards(&metas);

        // Assert

        assert_eq!(HashSet::from([kept.id()]), live);
    }
}
