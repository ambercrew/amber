use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose};
use uuid::Uuid;

use super::DefaultAnkiSyncService;
use super::plan::{AnkiEdit, SyncPlan};
use crate::anki_sync::anki_connect::retrieve_media_file;
use crate::anki_sync::notes::{anki_tags, basic_note, fingerprint, sent_asset_id};
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;
use crate::assets::utils::image_mime::sniff_image_mime;
use crate::common::services::lexical_html_converter::LexicalHtmlConverterError;
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::import::anki::math::convert_math;
use crate::import::anki::media::{image_srcs, replace_image_srcs};
use crate::import::epub::{html_unescape, percent_decode};
use crate::import::services::imported_html_converter::ImportedHtmlConverterError;

/// The largest image an Anki edit brings over, as for an imported package.
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

impl DefaultAnkiSyncService {
    /// Takes Anki's edits to Amber's cards, unless Amber saved the card later: then Amber's version goes to
    /// Anki as usual. Runs before the export, which sends each result back as Amber renders it. Returns
    /// the cards it updated.
    pub(super) async fn pull_edits(&self, plan: &SyncPlan) -> Result<Vec<Uuid>, AnkiSyncError> {
        let mut edits = Vec::new();
        for edit in &plan.edited_in_anki {
            if self.takes_anki_edit(edit).await? {
                edits.push(edit);
            }
        }
        let edits = self.edits_to_sides(edits).await?;
        if edits.is_empty() {
            return Ok(Vec::new());
        }
        let mut htmls = Vec::with_capacity(edits.len() * 2);
        for edit in &edits {
            // Amber sent its equations as MathJax, which comes back as equations like an import's.
            htmls.push(self.localize_media(&convert_math(&edit.front)).await?);
            htmls.push(self.localize_media(&convert_math(&edit.back)).await?);
        }
        // Waits on the frontend, so nothing is written before it.
        let contents = self.imported_html_converter.convert(htmls).await?;
        if contents.len() != edits.len() * 2 {
            return Err(ImportedHtmlConverterError::InvalidResponse.into());
        }

        let mut updated = Vec::new();
        for (edit, content) in edits.into_iter().zip(contents.chunks(2)) {
            // A card edited in Amber meanwhile keeps that edit, which the export then sends.
            if !self.takes_anki_edit(edit).await? {
                continue;
            }
            // An edit that left the sides as they were, such as a tag added in Anki.
            let card = self.card_repository.get_by_id(edit.card_id).await?;
            if card.front == content[0] && card.back == content[1] {
                continue;
            }
            let dto = UpdateCardDto {
                id: edit.card_id,
                front: content[0].clone(),
                back: content[1].clone(),
            };
            self.element_content_service.update_card(dto).await?;
            updated.push(edit.card_id);
        }
        Ok(updated)
    }

    /// Leaves out the edits whose note still holds the sides Amber renders the card as, such as a tag added
    /// in Anki: HTML converted back isn't the card's content to the letter, so it would replace the card.
    async fn edits_to_sides<'a>(
        &self,
        edits: Vec<&'a AnkiEdit>,
    ) -> Result<Vec<&'a AnkiEdit>, AnkiSyncError> {
        if edits.is_empty() {
            return Ok(edits);
        }
        let mut sides = Vec::with_capacity(edits.len() * 2);
        let mut notes = Vec::with_capacity(edits.len());
        for edit in &edits {
            let mut card = self.card_repository.get_by_id(edit.card_id).await?;
            sides.push(std::mem::take(&mut card.front));
            sides.push(std::mem::take(&mut card.back));
            notes.push(basic_note(
                &card,
                String::new(),
                String::new(),
                String::new(),
                Vec::new(),
            ));
        }
        let htmls = self.lexical_html_converter.convert_to_html(sides).await?;
        if htmls.len() != edits.len() * 2 {
            return Err(LexicalHtmlConverterError::InvalidResponse.into());
        }
        for (note, html) in notes.iter_mut().zip(htmls.chunks(2)) {
            note.fields = html.to_vec();
        }
        // Names the images as the export does, so the sides compare with Anki's.
        self.attach_media(&mut notes).await?;
        Ok(edits
            .into_iter()
            .zip(&notes)
            .filter(|(edit, note)| note.fields != [edit.front.as_str(), edit.back.as_str()])
            .map(|(edit, _)| edit)
            .collect())
    }

    /// The later edit wins. A note Amber changed only in ways that aren't its content, such as its tags,
    /// takes Anki's edit too, as the card was last saved before it was sent.
    pub(super) async fn takes_anki_edit(&self, edit: &AnkiEdit) -> Result<bool, AnkiSyncError> {
        if self.unchanged_since_sent(edit).await? {
            return Ok(true);
        }
        let saved = self
            .card_repository
            .get_content_modified_at(edit.card_id)
            .await?;
        Ok(saved.is_none_or(|saved| saved.timestamp() < edit.modified))
    }

    /// Whether the card's note is still what Amber last sent, compared the way the export compares it.
    async fn unchanged_since_sent(&self, edit: &AnkiEdit) -> Result<bool, AnkiSyncError> {
        let mut card = self.card_repository.get_by_id(edit.card_id).await?;
        let mut tags = self
            .meta_repository
            .get_tag_names_of(&[edit.card_id])
            .await?;
        let tags = anki_tags(&tags.remove(&edit.card_id).unwrap_or_default());
        let front = std::mem::take(&mut card.front);
        let back = std::mem::take(&mut card.back);
        // The deck isn't part of the fingerprint.
        let note = basic_note(&card, front, back, String::new(), tags);
        Ok(fingerprint(&note) == edit.sent_fingerprint)
    }

    /// Points `html`'s images at Amber's copies: media Amber sent at its asset, images added in Anki as
    /// data URIs, which saving the card stores as assets.
    async fn localize_media(&self, html: &str) -> Result<String, AnkiSyncError> {
        let mut resolved = HashMap::new();
        for src in image_srcs(html) {
            if resolved.contains_key(src) {
                continue;
            }
            let filename = percent_decode(&html_unescape(src));
            let local = match sent_asset_id(&filename) {
                Some(id) if self.asset_repository.get(&id).await?.is_some() => Some(id.src()),
                _ => self.media_data_uri(&filename).await?,
            };
            resolved.insert(src.to_string(), local);
        }
        Ok(replace_image_srcs(html, |src| {
            resolved.get(src).cloned().flatten()
        }))
    }

    async fn media_data_uri(&self, filename: &str) -> Result<Option<String>, AnkiSyncError> {
        let Some(bytes) = retrieve_media_file(self.client(), filename).await? else {
            return Ok(None);
        };
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
            return Ok(None);
        }
        Ok(sniff_image_mime(&bytes).map(|mime| {
            format!(
                "data:{mime};base64,{}",
                general_purpose::STANDARD.encode(&bytes)
            )
        }))
    }
}
