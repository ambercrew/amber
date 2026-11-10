use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::Utc;
use uuid::Uuid;

use super::DefaultAnkiSyncService;
use super::plan::{SlotsByGuid, SyncPlan};
use crate::anki_sync::entities::anki_card_pair::AnkiCardPair;
use crate::anki_sync::entities::anki_note::AnkiNote;
use crate::anki_sync::entities::anki_notetype::AnkiNotetype;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::notes::{
    anki_tags, asset_ids, basic_note, deck_name, fingerprint, media_name, occlusion_note,
    resolve_modified, use_media_names,
};
use crate::anki_sync::occlusion::cloze_slots;
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::anki_sync::services::sync_frontend::AnkiSyncStage;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::common::services::lexical_html_converter::LexicalHtmlConverterError;
use crate::elements::entities::card::Card;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;

/// Cards rendered per request, so progress moves and a sync can stop in between.
const RENDER_BATCH: usize = 100;

/// An Anki card, by its note's guid and its ordinal.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct AnkiCardKey {
    pub(super) guid: String,
    pub(super) ord: usize,
}

pub(super) struct Export {
    pub(super) notes: Vec<AnkiNote>,
    pub(super) media: BTreeMap<String, Vec<u8>>,
    /// The Amber card behind each Anki card of `notes`.
    pub(super) cards: HashMap<AnkiCardKey, Uuid>,
    /// Cards imported from Anki whose original card Anki still has, paired with it instead of exported.
    pub(super) linked: Vec<AnkiCardPair>,
    /// Cards of notes Anki holds as last sent, which aren't sent again.
    pub(super) unchanged: Vec<AnkiCardPair>,
    /// A record of each note sent, saved once Anki has taken them, and of each note left as it was whose
    /// Anki edit this sync has dealt with.
    pub(super) sent: Vec<ExportedNote>,
    /// Notes whose deck changed since they were last sent.
    pub(super) moved: HashSet<String>,
    /// How many of `notes` Anki holds that Amber edited.
    pub(super) sent_edits: usize,
}

impl Export {
    /// How many of the cards sent Anki held none of before, as `NoteChanges::new_cards` counts them.
    pub(super) fn new_cards_sent(&self, in_anki: &HashMap<Uuid, AnkiCardId>) -> usize {
        self.cards
            .values()
            .filter(|card_id| !in_anki.contains_key(card_id))
            .count()
    }

    /// Each card sent or linked, with its Anki card; `anki_cards` are the ids Anki gave the sent ones.
    pub(super) fn pairs(&self, anki_cards: &HashMap<AnkiCardKey, AnkiCardId>) -> Vec<AnkiCardPair> {
        self.cards
            .iter()
            .filter_map(|(key, card_id)| {
                Some(AnkiCardPair {
                    card_id: *card_id,
                    anki_card_id: *anki_cards.get(key)?,
                })
            })
            .chain(self.linked.iter().copied())
            .chain(self.unchanged.iter().copied())
            .collect()
    }
}

/// A note on its way to Anki, with the Amber card behind each of its Anki cards. A basic note's fields
/// hold Lexical JSON until it's rendered.
struct PendingNote {
    note: AnkiNote,
    cards: Vec<(AnkiCardKey, Uuid)>,
    /// Taken before rendering, so an unchanged note needn't be rendered at all.
    fingerprint: String,
}

impl PendingNote {
    fn new(note: AnkiNote, cards: Vec<(AnkiCardKey, Uuid)>) -> Self {
        let fingerprint = fingerprint(&note);
        Self {
            note,
            cards,
            fingerprint,
        }
    }
}

/// A live card on its way to Anki.
struct ExportCard {
    card: Card,
    deck: String,
    tags: Vec<String>,
}

/// Amber's live cards, by how each reaches Anki.
struct ExportCards {
    basic: Vec<ExportCard>,
    occluded: BTreeMap<Uuid, Vec<ExportCard>>,
    /// Cards Anki holds the original of.
    linked: Vec<AnkiCardPair>,
}

/// Amber's notes split by whether Anki holds them as last sent, before any is rendered.
pub(super) struct NoteChanges {
    unchanged: Vec<AnkiCardPair>,
    changed: Vec<PendingNote>,
    /// The profile's record of each note last sent, by guid.
    previous: HashMap<String, ExportedNote>,
    linked: Vec<AnkiCardPair>,
    /// Notes Anki edited that Amber sends again over the edit, with Anki's time of it, by guid.
    overwritten: HashMap<String, i64>,
}

impl NoteChanges {
    /// Notes Anki holds that Amber changed since: their content, tags or deck. A note sent again only
    /// because the rendering or a pairing changed isn't one.
    fn edited(&self) -> impl Iterator<Item = &PendingNote> {
        self.changed.iter().filter(|pending| {
            let guid = &pending.note.guid;
            self.previous.get(guid).is_some_and(|previous| {
                previous.fingerprint != pending.fingerprint
                    || previous.deck != pending.note.deck
                    || self.overwritten.contains_key(guid)
            })
        })
    }

    /// How many cards go to Anki for the first time, by the deck they land in: those of the notes to send
    /// that Anki holds no card of, as last paired.
    /// `in_anki` are the cards Anki holds already, and `trashed` those the sync trashes before sending any.
    pub(super) fn new_cards(
        &self,
        in_anki: &HashMap<Uuid, AnkiCardId>,
        trashed: &HashSet<Uuid>,
    ) -> BTreeMap<String, usize> {
        let mut by_deck: BTreeMap<String, usize> = BTreeMap::new();
        for pending in &self.changed {
            let new = pending
                .cards
                .iter()
                .filter(|(_, card_id)| !in_anki.contains_key(card_id) && !trashed.contains(card_id))
                .count();
            if new > 0 {
                *by_deck.entry(pending.note.deck.clone()).or_default() += new;
            }
        }
        by_deck
    }

    /// Every card the sync pairs, as `Export::pairs` will: with its Anki card, or none for one Anki doesn't
    /// hold yet.
    pub(super) fn cards_to_pair(
        &self,
        in_anki: &HashMap<Uuid, AnkiCardId>,
        trashed: &HashSet<Uuid>,
    ) -> Vec<(Uuid, Option<AnkiCardId>)> {
        let sent = self
            .changed
            .iter()
            .flat_map(|pending| &pending.cards)
            .map(|(_, card_id)| (*card_id, in_anki.get(card_id).copied()));
        self.unchanged
            .iter()
            .chain(&self.linked)
            .map(|pair| (pair.card_id, Some(pair.anki_card_id)))
            .chain(sent)
            .filter(|(card_id, _)| !trashed.contains(card_id))
            .collect()
    }

    /// How many notes Amber's edits update in Anki, leaving out those with a card in `not_amber`'s, such as
    /// one whose Anki edit was just taken: that note goes back as Amber renders it, not as an edit of Amber's.
    pub(super) fn amber_edits(&self, not_amber: &HashSet<Uuid>) -> usize {
        self.edited()
            .filter(|pending| {
                !pending
                    .cards
                    .iter()
                    .any(|(_, card_id)| not_amber.contains(card_id))
            })
            .count()
    }
}

impl DefaultAnkiSyncService {
    /// Live cards as Anki notes: a basic note per card, one note per image occlusion. Notes Anki already
    /// holds as last sent are left out, so only what changed is rendered and imported. `pulled` are the cards
    /// this sync took Anki's edits to.
    pub(super) async fn export(
        &self,
        plan: &SyncPlan,
        pulled: &HashSet<Uuid>,
    ) -> Result<Export, AnkiSyncError> {
        let changes = self.note_changes(plan).await?;
        let sent_edits = changes.amber_edits(pulled);
        let NoteChanges {
            unchanged,
            mut changed,
            previous,
            linked,
            overwritten,
        } = changes;
        self.render_basic_notes(&mut changed).await?;

        let now = Utc::now().timestamp();
        let mut notes = Vec::with_capacity(changed.len());
        let mut cards = HashMap::new();
        let mut sent = Vec::with_capacity(changed.len());
        let mut moved = HashSet::new();
        for PendingNote {
            mut note,
            cards: keys,
            fingerprint,
        } in changed
        {
            let previous = previous.get(&note.guid);
            if previous.is_some_and(|previous| previous.deck != note.deck) {
                moved.insert(note.guid.clone());
            }
            // Anki's importer only takes a note newer than its own copy.
            if let Some(edited_at) = overwritten.get(&note.guid) {
                note.modified = note.modified.max(edited_at + 1);
            }
            sent.push(resolve_modified(&mut note, previous, fingerprint, now));
            cards.extend(keys);
            notes.push(note);
        }
        sent.extend(seen_edits(plan, &previous, &sent));
        let media = self.attach_media(&mut notes).await?;
        Ok(Export {
            notes,
            media,
            cards,
            linked,
            unchanged,
            sent,
            moved,
            sent_edits,
        })
    }

    /// Which of Amber's notes changed since Anki last got them, compared by their Lexical JSON, so the
    /// preview can count them without rendering.
    pub(super) async fn note_changes(&self, plan: &SyncPlan) -> Result<NoteChanges, AnkiSyncError> {
        let metas: HashMap<_, _> = self
            .meta_repository
            .get_all_ordered_by_priority()
            .await?
            .into_iter()
            .map(|meta| (meta.element_id, meta))
            .collect();
        let linked_cards = self.linked_cards(&metas, &plan.existing_cards).await?;
        let occlusion_links: HashMap<Uuid, ImageOcclusionCardLink> = self
            .image_occlusion_repository
            .get_all_links()
            .await?
            .into_iter()
            .map(|link| (link.card_id, link))
            .collect();
        let export_cards = self
            .export_cards(&metas, &linked_cards, &occlusion_links)
            .await?;

        let mut pending = basic_notes(export_cards.basic);
        pending.extend(
            self.occlusion_notes(
                export_cards.occluded,
                &occlusion_links,
                &plan.previous_slots,
            )
            .await?,
        );
        let previous = self.exported_notes(&plan.profile).await?;
        let overwritten = plan.occlusions_edited_in_anki.clone();
        let (unchanged, changed) = split_unchanged(pending, &previous, &plan.paired, &overwritten);
        Ok(NoteChanges {
            unchanged,
            changed,
            previous,
            linked: export_cards.linked,
            overwritten,
        })
    }

    /// Each imported card whose original Anki still has, with that Anki card. A package imported twice links
    /// two cards to one Anki card: only the first is paired, the other maps to `None` and isn't exported.
    async fn linked_cards(
        &self,
        metas: &HashMap<ElementId, Meta>,
        existing_cards: &HashSet<AnkiCardId>,
    ) -> Result<HashMap<Uuid, Option<AnkiCardId>>, AnkiSyncError> {
        let mut links = self.anki_card_link_repository.get_all().await?;
        links.retain(|link| {
            metas.contains_key(&ElementId::Card(link.card_id))
                && existing_cards.contains(&link.anki_card_id)
        });
        links.sort_by_key(|link| link.card_id);
        let mut paired = HashSet::new();
        Ok(links
            .into_iter()
            .map(|link| {
                let pair = paired
                    .insert(link.anki_card_id)
                    .then_some(link.anki_card_id);
                (link.card_id, pair)
            })
            .collect())
    }

    /// Sorts the live cards into basic and occluded ones, and those Anki holds the original of.
    async fn export_cards(
        &self,
        metas: &HashMap<ElementId, Meta>,
        linked_cards: &HashMap<Uuid, Option<AnkiCardId>>,
        occlusion_links: &HashMap<Uuid, ImageOcclusionCardLink>,
    ) -> Result<ExportCards, AnkiSyncError> {
        // Anki keeps the original note of an occlusion imported from it, so none is exported.
        let anki_occlusions: HashSet<Uuid> = occlusion_links
            .values()
            .filter(|link| linked_cards.contains_key(&link.card_id))
            .map(|link| link.occlusion_id)
            .collect();
        let all_cards = self.card_repository.get_all().await?;
        let anki_decks = self
            .anki_card_link_repository
            .get_folder_anki_decks()
            .await?;
        let ids: Vec<Uuid> = all_cards
            .iter()
            .map(|card| card.meta.element_id.id())
            .collect();
        let mut tags = self.meta_repository.get_tag_names_of(&ids).await?;
        let mut export_cards = ExportCards {
            basic: Vec::new(),
            occluded: BTreeMap::new(),
            linked: Vec::new(),
        };
        for card in all_cards {
            let id = card.meta.element_id.id();
            let link = occlusion_links.get(&id);
            // A card under a trashed ancestor is left out, but keeps its note in Anki.
            let Some(deck) = deck_name(&card, metas, &anki_decks) else {
                continue;
            };
            if link.is_some_and(|link| anki_occlusions.contains(&link.occlusion_id))
                || linked_cards.contains_key(&id)
            {
                if let Some(Some(anki_card_id)) = linked_cards.get(&id) {
                    export_cards.linked.push(AnkiCardPair {
                        card_id: id,
                        anki_card_id: *anki_card_id,
                    });
                }
                continue;
            }
            let tags = anki_tags(&tags.remove(&id).unwrap_or_default());
            let export_card = ExportCard { card, deck, tags };
            match link {
                Some(link) => export_cards
                    .occluded
                    .entry(link.occlusion_id)
                    .or_default()
                    .push(export_card),
                None => export_cards.basic.push(export_card),
            }
        }
        Ok(export_cards)
    }

    /// Replaces the basic notes' Lexical JSON with HTML, rendered by the frontend.
    async fn render_basic_notes(&self, changed: &mut [PendingNote]) -> Result<(), AnkiSyncError> {
        let mut basic: Vec<&mut AnkiNote> = changed
            .iter_mut()
            .map(|pending| &mut pending.note)
            .filter(|note| note.notetype == AnkiNotetype::Basic)
            .collect();
        let sides: Vec<String> = basic
            .iter()
            .flat_map(|note| note.fields.iter().cloned())
            .collect();
        let mut htmls = self.render_html(&sides).await?.into_iter();
        for field in basic.iter_mut().flat_map(|note| note.fields.iter_mut()) {
            *field = htmls
                .next()
                .ok_or(LexicalHtmlConverterError::InvalidResponse)?;
        }
        Ok(())
    }

    /// Renders cards' sides, front and back in turn, reporting progress per card.
    async fn render_html(&self, sides: &[String]) -> Result<Vec<String>, AnkiSyncError> {
        let total = sides.len() / 2;
        self.sync_frontend
            .report_progress(AnkiSyncStage::Sending, 0, total);
        let mut htmls = Vec::with_capacity(sides.len());
        for batch in sides.chunks(RENDER_BATCH * 2) {
            self.check_cancelled()?;
            htmls.extend(
                self.lexical_html_converter
                    .convert_to_html(batch.to_vec())
                    .await?,
            );
            self.sync_frontend
                .report_progress(AnkiSyncStage::Sending, htmls.len() / 2, total);
        }
        Ok(htmls)
    }

    /// One note per occlusion, keeping each target's cloze number from Anki's copy.
    async fn occlusion_notes(
        &self,
        occluded: BTreeMap<Uuid, Vec<ExportCard>>,
        links: &HashMap<Uuid, ImageOcclusionCardLink>,
        previous_slots: &SlotsByGuid,
    ) -> Result<Vec<PendingNote>, AnkiSyncError> {
        // A target's link goes with its card, unlike the mask, which stays drawn.
        let linked_targets: HashSet<(Uuid, &str)> = links
            .values()
            .map(|link| (link.occlusion_id, link.target_key.as_str()))
            .collect();
        let mut notes = Vec::new();
        for (occlusion_id, group) in occluded {
            // Links can arrive through cloud sync before their occlusion does.
            let occlusion = match self
                .image_occlusion_repository
                .get_by_id(occlusion_id)
                .await
            {
                Err(RepositoryError::NotFound(_)) => continue,
                result => result?,
            };
            let guid = occlusion.id.hyphenated().to_string();
            let previous = previous_slots.get(&guid).map_or(&[][..], Vec::as_slice);
            let slots = cloze_slots(previous, &occlusion.target_keys());
            let mut tags: Vec<String> = group
                .iter()
                .flat_map(|export| export.tags.clone())
                .collect();
            tags.sort();
            tags.dedup();
            let group_cards: Vec<&Card> = group.iter().map(|export| &export.card).collect();
            let deck = group[0].deck.clone();
            let mut note = occlusion_note(&occlusion, &slots, &group_cards, deck, tags);
            note.card_ords.retain(|ord| {
                let key = slots[*ord].as_deref().unwrap_or_default();
                linked_targets.contains(&(occlusion_id, key))
            });
            let mut cards = Vec::new();
            for card in group_cards {
                let id = card.meta.element_id.id();
                if let Some(ord) = slots
                    .iter()
                    .position(|slot| slot.as_ref() == Some(&links[&id].target_key))
                {
                    let key = AnkiCardKey {
                        guid: note.guid.clone(),
                        ord,
                    };
                    cards.push((key, id));
                }
            }
            notes.push(PendingNote::new(note, cards));
        }
        Ok(notes)
    }

    /// The images the notes use, by Anki media filename, pointing the notes at those files.
    pub(super) async fn attach_media(
        &self,
        notes: &mut [AnkiNote],
    ) -> Result<BTreeMap<String, Vec<u8>>, AnkiSyncError> {
        let mut media = BTreeMap::new();
        let mut names = HashMap::new();
        for id in asset_ids(notes) {
            let Ok(asset_id) = AssetId::try_from(id.clone()) else {
                continue;
            };
            if let Some(asset) = self.asset_repository.get(&asset_id).await? {
                names.insert(id, media_name(&asset));
                media.insert(media_name(&asset), asset.data);
            }
        }
        use_media_names(notes, &names);
        Ok(media)
    }

    /// The profile's record of each note last sent, by guid.
    pub(super) async fn exported_notes(
        &self,
        profile: &str,
    ) -> Result<HashMap<String, ExportedNote>, AnkiSyncError> {
        Ok(self
            .anki_sync_repository
            .get_exported_notes(profile)
            .await?
            .into_iter()
            .map(|note| (note.guid.clone(), note))
            .collect())
    }
}

/// The records of notes edited in Anki that aren't sent back, dated at that edit: it changed nothing Amber
/// holds, such as a tag, and would otherwise count as a new edit on every sync.
fn seen_edits(
    plan: &SyncPlan,
    previous: &HashMap<String, ExportedNote>,
    sent: &[ExportedNote],
) -> Vec<ExportedNote> {
    let sent: HashSet<&str> = sent.iter().map(|note| note.guid.as_str()).collect();
    plan.edited_in_anki
        .iter()
        .filter_map(|edit| {
            let record = previous.get(&edit.card_id.hyphenated().to_string())?;
            (!sent.contains(record.guid.as_str())).then(|| ExportedNote {
                modified: edit.modified,
                ..record.clone()
            })
        })
        .collect()
}

/// A basic note per card, its fields still Lexical JSON.
fn basic_notes(cards: Vec<ExportCard>) -> Vec<PendingNote> {
    cards
        .into_iter()
        .map(
            |ExportCard {
                 mut card,
                 deck,
                 tags,
             }| {
                let front = std::mem::take(&mut card.front);
                let back = std::mem::take(&mut card.back);
                let note = basic_note(&card, front, back, deck, tags);
                let key = AnkiCardKey {
                    guid: note.guid.clone(),
                    ord: 0,
                };
                PendingNote::new(note, vec![(key, card.meta.element_id.id())])
            },
        )
        .collect()
}

/// Splits off the notes Anki holds as last sent, keeping just their pairs; the rest must be sent.
fn split_unchanged(
    pending: Vec<PendingNote>,
    previous: &HashMap<String, ExportedNote>,
    paired: &HashMap<Uuid, AnkiCardId>,
    overwritten: &HashMap<String, i64>,
) -> (Vec<AnkiCardPair>, Vec<PendingNote>) {
    let mut unchanged = Vec::new();
    let mut changed = Vec::new();
    for pending in pending {
        let previous = previous
            .get(&pending.note.guid)
            .filter(|_| !overwritten.contains_key(&pending.note.guid));
        match unchanged_pairs(&pending, previous, paired) {
            Some(pairs) => unchanged.extend(pairs),
            None => changed.push(pending),
        }
    }
    (unchanged, changed)
}

/// The note's pairs when Anki holds it as last sent: same content and deck, and every card still paired.
fn unchanged_pairs(
    pending: &PendingNote,
    previous: Option<&ExportedNote>,
    paired: &HashMap<Uuid, AnkiCardId>,
) -> Option<Vec<AnkiCardPair>> {
    let previous = previous?;
    if !previous.holds(&pending.fingerprint) || previous.deck != pending.note.deck {
        return None;
    }
    pending
        .cards
        .iter()
        .map(|(_, card_id)| {
            Some(AnkiCardPair {
                card_id: *card_id,
                anki_card_id: *paired.get(card_id)?,
            })
        })
        .collect()
}
