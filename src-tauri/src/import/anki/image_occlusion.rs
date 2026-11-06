use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::{
    MaskShape, OcclusionShape, TextShape,
};
use crate::import::epub::html_unescape;

use super::entities::notetype::Notetype;

/// Anki's own default mask color, which Amber's editor shares.
const DEFAULT_FILL: &str = "#ffeba2";
const DEFAULT_TEXT_COLOR: &str = "#000000";
/// Anki's default label size in pixels, when a label doesn't store one.
const DEFAULT_FONT_PX: f64 = 40.0;
/// Coordinates above this are pixels, as notes from before Anki normalized them hold.
const MAX_NORMALIZED: f64 = 1.5;

/// `{{c1::image-occlusion:rect:left=.2:top=.1:...}}`; labels may lack the cloze.
static OCCLUSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{(?:c(\d+)::)?image-occlusion:([^}]*)\}\}").expect("valid occlusion regex")
});
static COLOR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$").expect("valid color regex"));

/// Anki's stock Image Occlusion notetype, or a copy of it; its template draws the masks in script.
pub fn is_image_occlusion(notetype: &Notetype) -> bool {
    notetype.is_cloze
        && notetype
            .templates
            .first()
            .is_some_and(|template| template.question.contains("image-occlusion"))
}

pub fn contains_occlusions(field: &str) -> bool {
    OCCLUSION.is_match(field)
}

/// The masks and labels of an occlusion field; each cloze number becomes a group, quizzed as one card.
pub fn parse_occlusions(
    field: &str,
    width: u32,
    height: u32,
) -> (Vec<OcclusionShape>, OcclusionMode) {
    let entries: Vec<(Option<u32>, Props)> = OCCLUSION
        .captures_iter(field)
        .map(|caps| {
            (
                caps.get(1).and_then(|ord| ord.as_str().parse().ok()),
                Props::parse(&caps[2]),
            )
        })
        .collect();
    let in_pixels = entries.iter().any(|(_, props)| props.is_in_pixels());
    let scale = Scale {
        width: if in_pixels { width as f64 } else { 1.0 },
        height: if in_pixels { height as f64 } else { 1.0 },
        image_height: height as f64,
    };

    let mut hide_all = false;
    let shapes = entries
        .into_iter()
        .enumerate()
        .filter_map(|(index, (ord, props))| {
            let id = format!("anki-{index}");
            // A cloze 0 or no cloze at all quizzes nothing, as labels are stored.
            let group = ord.filter(|ord| *ord > 0).map(|ord| format!("c{ord}"));
            let shape = match props.kind.as_str() {
                "text" => OcclusionShape::Text(text_shape(id, &props, &scale)),
                _ => {
                    let mask = mask_shape(id, group?, &props, &scale)?;
                    hide_all |= props.get("oi") == Some(1.0);
                    if props.kind == "ellipse" {
                        OcclusionShape::Ellipse(mask)
                    } else {
                        OcclusionShape::Rect(mask)
                    }
                }
            };
            Some(shape)
        })
        .collect();

    let mode = if hide_all {
        OcclusionMode::HideAllGuessOne
    } else {
        OcclusionMode::HideOneGuessOne
    };
    (shapes, mode)
}

struct Scale {
    width: f64,
    height: f64,
    image_height: f64,
}

struct Props {
    kind: String,
    values: HashMap<String, String>,
}

impl Props {
    fn parse(data: &str) -> Self {
        let mut parts = data.split(':');
        let kind = parts.next().unwrap_or_default().trim().to_string();
        let values = parts
            .filter_map(|part| part.split_once('='))
            .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
            .collect();
        Self { kind, values }
    }

    fn get(&self, key: &str) -> Option<f64> {
        self.values.get(key)?.parse().ok()
    }

    fn is_in_pixels(&self) -> bool {
        ["left", "top", "width", "height", "rx", "ry"]
            .iter()
            .filter_map(|key| self.get(key))
            .any(|value| value > MAX_NORMALIZED)
    }

    /// Fabric's polygons store their points, not a size; Amber has no polygon, so it gets their bounds.
    fn points_bounds(&self) -> Option<(f64, f64, f64, f64)> {
        let points: Vec<(f64, f64)> = self
            .values
            .get("points")?
            .split_whitespace()
            .filter_map(|point| {
                let (x, y) = point.split_once(',')?;
                Some((x.parse().ok()?, y.parse().ok()?))
            })
            .collect();
        let min_x = points.iter().map(|p| p.0).reduce(f64::min)?;
        let min_y = points.iter().map(|p| p.1).reduce(f64::min)?;
        let max_x = points.iter().map(|p| p.0).reduce(f64::max)?;
        let max_y = points.iter().map(|p| p.1).reduce(f64::max)?;
        Some((min_x, min_y, max_x - min_x, max_y - min_y))
    }
}

fn mask_shape(id: String, group: String, props: &Props, scale: &Scale) -> Option<MaskShape> {
    let (x, y, width, height) = match props.kind.as_str() {
        "rect" => (
            props.get("left")?,
            props.get("top")?,
            props.get("width")?,
            props.get("height")?,
        ),
        "ellipse" => (
            props.get("left")?,
            props.get("top")?,
            props.get("rx")? * 2.0,
            props.get("ry")? * 2.0,
        ),
        "polygon" => props.points_bounds()?,
        _ => return None,
    };
    let fill = props
        .values
        .get("fill")
        .filter(|fill| COLOR.is_match(fill))
        .map_or(DEFAULT_FILL, String::as_str);
    Some(MaskShape {
        id,
        x: x / scale.width,
        y: y / scale.height,
        width: width / scale.width,
        height: height / scale.height,
        rotation: props.get("angle").unwrap_or(0.0),
        fill: fill.to_string(),
        group_id: Some(group),
    })
}

fn text_shape(id: String, props: &Props, scale: &Scale) -> TextShape {
    let font_px = props
        .get("fs")
        .map(|fs| {
            if fs > MAX_NORMALIZED {
                fs
            } else {
                fs * scale.image_height
            }
        })
        .unwrap_or(DEFAULT_FONT_PX);
    let color = props
        .values
        .get("fill")
        .filter(|fill| COLOR.is_match(fill))
        .map_or(DEFAULT_TEXT_COLOR, String::as_str);
    TextShape {
        id,
        x: props.get("left").unwrap_or(0.0) / scale.width,
        y: props.get("top").unwrap_or(0.0) / scale.height,
        rotation: props.get("angle").unwrap_or(0.0),
        text: html_unescape(props.values.get("text").map_or("", String::as_str)),
        font_size: font_px * props.get("scale").unwrap_or(1.0) / scale.image_height.max(1.0),
        color: color.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn masks(shapes: &[OcclusionShape]) -> Vec<&MaskShape> {
        shapes
            .iter()
            .filter_map(|shape| match shape {
                OcclusionShape::Rect(mask) | OcclusionShape::Ellipse(mask) => Some(mask),
                OcclusionShape::Text(_) => None,
            })
            .collect()
    }

    #[test]
    fn parse_occlusions_normalized_shapes_groups_by_cloze() {
        // Arrange

        let field = "{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.05:oi=1}}<br>\
            {{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2:angle=30:fill=#ff0000}}\
            {{c1::image-occlusion:polygon:left=.1:top=.6:points=.1,.6 .3,.9 .2,.7}}";

        // Act

        let (shapes, mode) = parse_occlusions(field, 800, 600);

        // Assert

        assert_eq!(OcclusionMode::HideAllGuessOne, mode);
        let masks = masks(&shapes);
        assert_eq!(3, masks.len());
        assert_eq!(
            (0.1, 0.2, 0.3, 0.05),
            (masks[0].x, masks[0].y, masks[0].width, masks[0].height)
        );
        assert_eq!(Some("c1"), masks[0].group_id.as_deref());
        assert!(matches!(shapes[1], OcclusionShape::Ellipse(_)));
        assert_eq!(
            (0.2, 0.4, 30.0),
            (masks[1].width, masks[1].height, masks[1].rotation)
        );
        assert_eq!("#ff0000", masks[1].fill);
        assert_eq!(Some("c1"), masks[2].group_id.as_deref());
        assert!((masks[2].height - 0.3).abs() < 1e-9);
    }

    #[test]
    fn parse_occlusions_pixel_coordinates_normalizes_to_image() {
        // Arrange

        let field = "{{c1::image-occlusion:rect:left=80:top=60:width=400:height=30}}";

        // Act

        let (shapes, mode) = parse_occlusions(field, 800, 600);

        // Assert

        assert_eq!(OcclusionMode::HideOneGuessOne, mode);
        let mask = masks(&shapes)[0];
        assert_eq!(
            (0.1, 0.1, 0.5, 0.05),
            (mask.x, mask.y, mask.width, mask.height)
        );
        assert_eq!(DEFAULT_FILL, mask.fill);
    }

    #[test]
    fn parse_occlusions_label_without_cloze_becomes_text() {
        // Arrange

        let field = "{{image-occlusion:text:left=.2:top=.3:text=A &amp; B:scale=2:fs=.05}}";

        // Act

        let (shapes, _) = parse_occlusions(field, 800, 600);

        // Assert

        let [OcclusionShape::Text(text)] = shapes.as_slice() else {
            panic!("expected one label");
        };
        assert_eq!("A & B", text.text);
        assert!((text.font_size - 0.1).abs() < 1e-9);
    }
}
