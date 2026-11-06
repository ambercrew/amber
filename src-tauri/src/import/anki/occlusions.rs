use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;
use crate::import::epub::html_unescape;

use super::enhanced_occlusion::{
    is_enhanced_occlusion, occlusion_key, occlusion_mode, parse_original_mask,
};
use super::entities::anki_occlusion::AnkiOcclusion;
use super::entities::note::Note;
use super::entities::notetype::Notetype;
use super::image_occlusion::{contains_occlusions, is_image_occlusion, parse_occlusions};
use super::media::{LocalImage, MediaLocalizer};
use super::template::strip_html;

const DEFAULT_NAME: &str = "Image occlusion";
const MAX_NAME_CHARS: usize = 80;
/// Anki's stock fields: Occlusion, Image, Header, Back Extra, Comments.
const NATIVE_HEADER_FIELD: usize = 2;
/// The add-on's stock fields, by name and position: renamed fields are found by position.
const ENHANCED_ID_FIELD: (&str, usize) = ("ID (hidden)", 0);
const ENHANCED_HEADER_FIELD: (&str, usize) = ("Header", 1);
const ENHANCED_IMAGE_FIELD: (&str, usize) = ("Image", 2);
const ENHANCED_ORIGINAL_MASK_FIELD: (&str, usize) = ("Original Mask", 10);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OcclusionFormat {
    /// Anki's built-in image occlusion: one note, a card per cloze.
    Native,
    /// The Image Occlusion Enhanced add-on: a note per card, sharing an id prefix.
    Enhanced,
}

pub fn occlusion_format(notetype: &Notetype) -> Option<OcclusionFormat> {
    if is_image_occlusion(notetype) {
        Some(OcclusionFormat::Native)
    } else if is_enhanced_occlusion(notetype) {
        Some(OcclusionFormat::Enhanced)
    } else {
        None
    }
}

/// Shared by every note whose cards make up one occlusion.
pub fn note_occlusion_key(
    format: OcclusionFormat,
    note_id: i64,
    note: &Note,
    notetype: &Notetype,
) -> String {
    let enhanced_key = (format == OcclusionFormat::Enhanced)
        .then(|| field(note, notetype, ENHANCED_ID_FIELD))
        .flatten()
        .and_then(|id| occlusion_key(&strip_html(id)).map(str::to_string));
    enhanced_key.unwrap_or_else(|| format!("note-{note_id}"))
}

/// None when the note has no image or no mask to quiz.
pub fn convert_occlusion(
    format: OcclusionFormat,
    note: &Note,
    notetype: &Notetype,
    localizer: &mut MediaLocalizer,
) -> Option<AnkiOcclusion> {
    match format {
        OcclusionFormat::Native => convert_native(note, localizer),
        OcclusionFormat::Enhanced => convert_enhanced(note, notetype, localizer),
    }
}

fn convert_native(note: &Note, localizer: &mut MediaLocalizer) -> Option<AnkiOcclusion> {
    let occlusion_field = note
        .fields
        .iter()
        .position(|field| contains_occlusions(field))?;
    let image = note
        .fields
        .iter()
        .enumerate()
        .filter(|(index, _)| *index != occlusion_field)
        .find_map(|(_, field)| localizer.first_image(field))?;
    let (shapes, mode) = parse_occlusions(&note.fields[occlusion_field], image.width, image.height);
    let header = note.fields.get(NATIVE_HEADER_FIELD).map(String::as_str);
    build_occlusion(note, header, image, shapes, mode)
}

fn convert_enhanced(
    note: &Note,
    notetype: &Notetype,
    localizer: &mut MediaLocalizer,
) -> Option<AnkiOcclusion> {
    let id = strip_html(field(note, notetype, ENHANCED_ID_FIELD)?);
    let mode = occlusion_mode(&id)?;
    let image = localizer.first_image(field(note, notetype, ENHANCED_IMAGE_FIELD)?)?;
    let mask = localizer.first_file(field(note, notetype, ENHANCED_ORIGINAL_MASK_FIELD)?)?;
    let shapes = parse_original_mask(std::str::from_utf8(&mask).ok()?)?;
    let header = field(note, notetype, ENHANCED_HEADER_FIELD);
    build_occlusion(note, header, image, shapes, mode)
}

fn build_occlusion(
    note: &Note,
    header: Option<&str>,
    image: LocalImage,
    shapes: Vec<OcclusionShape>,
    mode: OcclusionMode,
) -> Option<AnkiOcclusion> {
    if !shapes.iter().any(|shape| shape.target_key().is_some()) {
        return None;
    }
    let name = header
        .map(|header| html_unescape(strip_html(header).trim()))
        .filter(|header| !header.is_empty())
        .map_or_else(
            || DEFAULT_NAME.to_string(),
            |header| header.chars().take(MAX_NAME_CHARS).collect(),
        );
    Some(AnkiOcclusion {
        name,
        image_asset_id: image.asset_id,
        image_width: image.width,
        image_height: image.height,
        shapes,
        mode,
        tags: note.tags.clone(),
        anki_cards: Vec::new(),
    })
}

/// The target an occlusion note's card quizzes: native cards are numbered by cloze, and the add-on names each
/// note after its target.
pub fn card_target_key(
    format: OcclusionFormat,
    note: &Note,
    notetype: &Notetype,
    ord: i64,
) -> Option<String> {
    match format {
        OcclusionFormat::Native => Some(format!("c{}", ord + 1)),
        OcclusionFormat::Enhanced => {
            field(note, notetype, ENHANCED_ID_FIELD).map(|id| strip_html(id).trim().to_string())
        }
    }
}

fn field<'a>(note: &'a Note, notetype: &Notetype, (name, index): (&str, usize)) -> Option<&'a str> {
    let index = notetype
        .fields
        .iter()
        .position(|field| field == name)
        .unwrap_or(index);
    note.fields.get(index).map(String::as_str)
}
