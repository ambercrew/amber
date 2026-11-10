use std::collections::{HashMap, HashSet};

use uuid::Uuid;

use super::DefaultAnkiSyncService;
use super::plan::{OcclusionChange, SyncPlan};
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::elements::value_objects::element_id::ElementId;
use crate::image_occlusion::dto::update_image_occlusion_dto::UpdateImageOcclusionDto;
use crate::import::anki::entities::anki_card_link::AnkiCardLink;
use crate::import::anki::entities::anki_occlusion::AnkiOcclusion;
use crate::import::anki::extraction::{AnkiExtractionError, extract_anki_cards};
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::services::anki_import_service::AnkiImportError;
use crate::import::services::imported_html_converter::ImportedHtmlConverterError;

impl DefaultAnkiSyncService {
    /// Renders imported cards whose note changed in Anki again, the way importing them did, and replaces
    /// Amber's copy: Anki holds the note's fields, which Amber's front and back can't be split back into.
    /// Image occlusions are left as they are. Returns the cards whose content changed.
    pub(super) async fn refresh_imported_cards(
        &self,
        plan: &SyncPlan,
    ) -> Result<Vec<Uuid>, AnkiSyncError> {
        let mut rendered = Vec::new();
        let mut images = Vec::new();
        for (deck, cards) in &plan.imported_changed_in_anki {
            self.check_cancelled()?;
            let bytes = self.export_deck(deck).await?;
            let wanted: HashSet<AnkiCardId> = cards.keys().copied().collect();
            let extraction =
                tokio::task::spawn_blocking(move || extract_anki_cards(bytes, &wanted))
                    .await
                    .map_err(AnkiImportError::from)?;
            let extraction = match extraction {
                Err(AnkiExtractionError::NoContent) => continue,
                result => result.map_err(AnkiImportError::from)?,
            };
            images.extend(extraction.images);
            for card in extraction.decks.into_iter().flat_map(|deck| deck.cards) {
                if let Some(card_id) = cards.get(&card.anki_card_id) {
                    rendered.push((*card_id, card.front, card.back));
                }
            }
        }
        if rendered.is_empty() {
            return Ok(Vec::new());
        }
        let htmls = rendered
            .iter()
            .flat_map(|(_, front, back)| [front.clone(), back.clone()])
            .collect();
        // Waits on the frontend, so nothing is written before it.
        let contents = self.imported_html_converter.convert(htmls).await?;
        if contents.len() != rendered.len() * 2 {
            return Err(ImportedHtmlConverterError::InvalidResponse.into());
        }

        for image in &images {
            self.asset_repository.insert_if_missing(image).await?;
        }
        let mut updated = Vec::new();
        for ((card_id, _, _), content) in rendered.into_iter().zip(contents.chunks(2)) {
            let current = self.card_repository.get_by_id(card_id).await?;
            // A tag or deck change touches the note too, leaving its sides as they were.
            if current.front == content[0] && current.back == content[1] {
                continue;
            }
            let dto = UpdateCardDto {
                id: card_id,
                front: content[0].clone(),
                back: content[1].clone(),
            };
            self.element_content_service.update_card(dto).await?;
            updated.push(card_id);
        }
        Ok(updated)
    }

    /// Takes the masks of imported occlusions whose note changed in Anki, as the importer reads them, and
    /// pairs the cards of masks added there. Returns the occlusions' cards Amber had.
    pub(super) async fn refresh_imported_occlusions(
        &self,
        plan: &SyncPlan,
    ) -> Result<Vec<Uuid>, AnkiSyncError> {
        let mut refreshed = Vec::new();
        for (deck, changes) in &plan.imported_occlusions_changed_in_anki {
            self.check_cancelled()?;
            let bytes = self.export_deck(deck).await?;
            let wanted: HashSet<AnkiCardId> = changes
                .iter()
                .flat_map(|change| change.anki_cards.iter().copied())
                .collect();
            let extraction =
                tokio::task::spawn_blocking(move || extract_anki_cards(bytes, &wanted))
                    .await
                    .map_err(AnkiImportError::from)?;
            let extraction = match extraction {
                Err(AnkiExtractionError::NoContent) => continue,
                result => result.map_err(AnkiImportError::from)?,
            };
            let occlusions: Vec<AnkiOcclusion> = extraction
                .decks
                .into_iter()
                .flat_map(|deck| deck.image_occlusions)
                .collect();
            for change in changes {
                let note = occlusions.iter().find(|occlusion| {
                    let mut cards = occlusion.anki_cards.iter();
                    cards.any(|(_, card)| change.anki_cards.contains(card))
                });
                if let Some(note) = note {
                    refreshed.extend(self.refresh_occlusion(change, note).await?);
                    // Each update asks the frontend for new cards' content, which mustn't wait on a write lock.
                    self.commit().await?;
                }
            }
        }
        Ok(refreshed)
    }

    async fn refresh_occlusion(
        &self,
        change: &OcclusionChange,
        note: &AnkiOcclusion,
    ) -> Result<Vec<Uuid>, AnkiSyncError> {
        let id = change.occlusion_id;
        let current = self.image_occlusion_repository.get_by_id(id).await?;
        // The masks sit on Amber's image, which an occlusion keeps: one replaced in Anki isn't taken.
        if current.image_asset_id != note.image_asset_id {
            return Ok(Vec::new());
        }
        let had = self
            .image_occlusion_repository
            .get_live_linked_card_ids(id)
            .await?;
        if current.shapes != note.shapes || current.mode != note.mode {
            let dto = UpdateImageOcclusionDto {
                id,
                shapes: note.shapes.clone(),
                mode: note.mode,
            };
            self.image_occlusion_service.update(dto).await?;
        }

        let paired: HashSet<Uuid> = self
            .anki_card_link_repository
            .get_all()
            .await?
            .into_iter()
            .map(|link| link.card_id)
            .collect();
        let anki_cards: HashMap<&String, AnkiCardId> = note
            .anki_cards
            .iter()
            .map(|(key, card)| (key, *card))
            .collect();
        for link in self.image_occlusion_repository.get_links(id).await? {
            let Some(anki_card_id) = anki_cards.get(&link.target_key) else {
                continue;
            };
            if paired.contains(&link.card_id) {
                continue;
            }
            self.anki_card_link_repository
                .create(&AnkiCardLink {
                    card_id: link.card_id,
                    anki_card_id: *anki_card_id,
                })
                .await?;
            if !note.tags.is_empty() {
                self.meta_repository
                    .add_tags(ElementId::Card(link.card_id), note.tags.clone())
                    .await?;
            }
        }
        Ok(had)
    }
}
