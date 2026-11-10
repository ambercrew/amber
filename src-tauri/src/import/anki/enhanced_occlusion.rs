use std::sync::LazyLock;

use regex::Regex;
use roxmltree::{Document, Node};

use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::{
    MaskShape, OcclusionShape, TextShape,
};

use super::entities::notetype::Notetype;

const DEFAULT_FILL: &str = "#ffeba2";
const DEFAULT_TEXT_COLOR: &str = "#000000";
const DEFAULT_FONT_SIZE: f64 = 24.0;
/// SVG places a label at its baseline, Amber at its top; roughly an ascent above it.
const ASCENT: f64 = 0.8;
const MASKS_LAYER: &str = "Masks";
const LABELS_LAYER: &str = "Labels";

/// The add-on's note ids: `<occlusion id>-<ao|oa>-<card number>`.
static NOTE_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*([0-9a-fA-F]+-(ao|oa))-\d+\s*$").expect("valid note id regex")
});

/// The Image Occlusion Enhanced add-on's notetype: one note per card, masks drawn as SVG images.
pub fn is_enhanced_occlusion(notetype: &Notetype) -> bool {
    notetype
        .templates
        .first()
        .is_some_and(|template| template.question.contains("io-overlay"))
}

/// The occlusion a note's card belongs to, shared by every note made from the same image.
pub fn occlusion_key(note_id: &str) -> Option<&str> {
    Some(NOTE_ID.captures(note_id)?.get(1)?.as_str())
}

/// `ao` hides every mask, `oa` only the one asked about.
pub fn occlusion_mode(note_id: &str) -> Option<OcclusionMode> {
    match NOTE_ID.captures(note_id)?.get(2)?.as_str() {
        "ao" => Some(OcclusionMode::HideAllGuessOne),
        _ => Some(OcclusionMode::HideOneGuessOne),
    }
}

/// The shapes of the add-on's "Original Mask" SVG; each top-level mask, or group of them, is one card.
pub fn parse_original_mask(svg: &str) -> Option<Vec<OcclusionShape>> {
    let document = Document::parse(svg).ok()?;
    let root = document.root_element();
    let width = number(root, "width")?;
    let height = number(root, "height")?;
    let size = (width, height);
    let mut shapes = Vec::new();

    if let Some(masks) = layer(root, MASKS_LAYER) {
        for (index, target) in masks.children().filter(is_shape).enumerate() {
            let group = target
                .attribute("id")
                .map_or_else(|| format!("ioe-{}", index + 1), str::to_string);
            let members: Vec<Node> = if target.has_tag_name("g") {
                target.descendants().filter(is_shape).skip(1).collect()
            } else {
                vec![target]
            };
            for member in members {
                let id = format!("ioe-{}", shapes.len());
                shapes.extend(mask_shape(member, id, &group, size));
            }
        }
    }
    if let Some(labels) = layer(root, LABELS_LAYER) {
        for label in labels
            .descendants()
            .filter(|node| node.has_tag_name("text"))
        {
            let id = format!("ioe-{}", shapes.len());
            shapes.extend(text_shape(label, id, size).map(OcclusionShape::Text));
        }
    }
    Some(shapes)
}

/// The add-on's editor puts each layer in a `<g>` titled with its name.
fn layer<'a, 'input>(root: Node<'a, 'input>, name: &str) -> Option<Node<'a, 'input>> {
    root.children().find(|node| {
        node.has_tag_name("g")
            && node
                .children()
                .any(|child| child.has_tag_name("title") && child.text() == Some(name))
    })
}

fn is_shape(node: &Node) -> bool {
    node.is_element() && !node.has_tag_name("title")
}

fn number(node: Node, attribute: &str) -> Option<f64> {
    let value = node.attribute(attribute)?.trim();
    value.trim_end_matches("px").parse().ok()
}

fn mask_shape(
    node: Node,
    id: String,
    group: &str,
    (width, height): (f64, f64),
) -> Option<OcclusionShape> {
    let (x, y, w, h) = match node.tag_name().name() {
        "rect" => (
            number(node, "x").unwrap_or(0.0),
            number(node, "y").unwrap_or(0.0),
            number(node, "width")?,
            number(node, "height")?,
        ),
        "ellipse" | "circle" => {
            let rx = number(node, "rx").or_else(|| number(node, "r"))?;
            let ry = number(node, "ry").or_else(|| number(node, "r"))?;
            let cx = number(node, "cx").unwrap_or(0.0);
            let cy = number(node, "cy").unwrap_or(0.0);
            (cx - rx, cy - ry, rx * 2.0, ry * 2.0)
        }
        // Amber has no polygon, so it gets its bounds.
        "polygon" => points_bounds(node.attribute("points")?)?,
        _ => return None,
    };
    let mask = MaskShape {
        id,
        x: x / width,
        y: y / height,
        width: w / width,
        height: h / height,
        rotation: 0.0,
        fill: node.attribute("fill").unwrap_or(DEFAULT_FILL).to_string(),
        group_id: Some(group.to_string()),
    };
    Some(
        if node.has_tag_name("rect") || node.has_tag_name("polygon") {
            OcclusionShape::Rect(mask)
        } else {
            OcclusionShape::Ellipse(mask)
        },
    )
}

fn points_bounds(points: &str) -> Option<(f64, f64, f64, f64)> {
    let values: Vec<f64> = points
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|value| !value.is_empty())
        .filter_map(|value| value.parse().ok())
        .collect();
    let xs = values.iter().step_by(2);
    let ys = values.iter().skip(1).step_by(2);
    let min_x = xs.clone().copied().reduce(f64::min)?;
    let max_x = xs.copied().reduce(f64::max)?;
    let min_y = ys.clone().copied().reduce(f64::min)?;
    let max_y = ys.copied().reduce(f64::max)?;
    Some((min_x, min_y, max_x - min_x, max_y - min_y))
}

fn text_shape(node: Node, id: String, (width, height): (f64, f64)) -> Option<TextShape> {
    let text: String = node
        .descendants()
        .filter(Node::is_text)
        .filter_map(|text| text.text())
        .collect::<Vec<_>>()
        .join(" ");
    if text.trim().is_empty() {
        return None;
    }
    let font_size = number(node, "font-size").unwrap_or(DEFAULT_FONT_SIZE);
    Some(TextShape {
        id,
        x: number(node, "x").unwrap_or(0.0) / width,
        y: (number(node, "y").unwrap_or(0.0) - font_size * ASCENT) / height,
        rotation: 0.0,
        text: text.trim().to_string(),
        font_size: font_size / height,
        color: node
            .attribute("fill")
            .unwrap_or(DEFAULT_TEXT_COLOR)
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORIGINAL_MASK: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200">
 <!-- Created with Image Occlusion Enhanced -->
 <g>
  <title>Labels</title>
  <text x="100" y="50" font-size="20" fill="#333333">Aorta</text>
 </g>
 <g>
  <title>Masks</title>
  <rect id="abc-ao-1" height="20" width="100" y="40" x="500" stroke="#2D2D2D" fill="#FFEBA2"/>
  <g id="abc-ao-2">
   <rect height="10" width="50" y="100" x="200" stroke="#2D2D2D" fill="#FFEBA2"/>
   <ellipse cx="300" cy="100" rx="50" ry="20" fill="#FFEBA2"/>
  </g>
 </g>
</svg>"##;

    fn mask(shape: &OcclusionShape) -> &MaskShape {
        match shape {
            OcclusionShape::Rect(mask) | OcclusionShape::Ellipse(mask) => mask,
            OcclusionShape::Text(_) => panic!("expected a mask"),
        }
    }

    #[test]
    fn parse_original_mask_groups_each_top_level_mask_into_one_target() {
        // Arrange

        let svg = ORIGINAL_MASK;

        // Act

        let shapes = parse_original_mask(svg).expect("expected the mask to parse");

        // Assert

        let targets: Vec<_> = shapes
            .iter()
            .filter_map(OcclusionShape::target_key)
            .collect();
        assert_eq!(vec!["abc-ao-1", "abc-ao-2", "abc-ao-2"], targets);
        let first = mask(&shapes[0]);
        assert_eq!(
            (0.5, 0.2, 0.1, 0.1),
            (first.x, first.y, first.width, first.height)
        );
        assert_eq!("#FFEBA2", first.fill);
        assert!(matches!(shapes[2], OcclusionShape::Ellipse(_)));
        assert_eq!((0.25, 0.4, 0.1, 0.2), {
            let ellipse = mask(&shapes[2]);
            (ellipse.x, ellipse.y, ellipse.width, ellipse.height)
        });
    }

    #[test]
    fn parse_original_mask_label_becomes_text_from_its_top() {
        // Arrange

        let svg = ORIGINAL_MASK;

        // Act

        let shapes = parse_original_mask(svg).expect("expected the mask to parse");

        // Assert

        let OcclusionShape::Text(label) = shapes.last().unwrap() else {
            panic!("expected the label last");
        };
        assert_eq!("Aorta", label.text);
        assert_eq!((0.1, 0.17, 0.1), (label.x, label.y, label.font_size));
    }

    #[test]
    fn occlusion_key_note_id_returns_shared_prefix_and_mode() {
        // Arrange

        let note_id = "d8b0f7e0c3f646678595def7ca3fa7e2-ao-3";

        // Act

        let key = occlusion_key(note_id);
        let mode = occlusion_mode(note_id);

        // Assert

        assert_eq!(Some("d8b0f7e0c3f646678595def7ca3fa7e2-ao"), key);
        assert_eq!(Some(OcclusionMode::HideAllGuessOne), mode);
    }
}
