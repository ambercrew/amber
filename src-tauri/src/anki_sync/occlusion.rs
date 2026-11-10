use crate::common::utils::html::escape_html_text;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::{MaskShape, OcclusionShape};

/// Each cloze number's target, by index. A target keeps its number, and a removed one leaves a `None`
/// gap, so Anki's card for an ordinal never changes target. New targets go at the end.
pub fn cloze_slots(previous: &[Option<String>], targets: &[String]) -> Vec<Option<String>> {
    let mut slots: Vec<Option<String>> = previous
        .iter()
        .map(|slot| slot.clone().filter(|key| targets.contains(key)))
        .collect();
    for target in targets {
        if !slots.iter().flatten().any(|key| key == target) {
            slots.push(Some(target.clone()));
        }
    }
    slots
}

/// Anki's image occlusion field: each Amber target becomes the cloze its slot numbers, shapes sharing a
/// target share it.
pub fn occlusion_field(occlusion: &ImageOcclusion, slots: &[Option<String>]) -> String {
    let hide_all = occlusion.mode == OcclusionMode::HideAllGuessOne;
    occlusion
        .shapes
        .iter()
        .map(|shape| {
            // Anki stores labels, which quiz nothing, as cloze 0.
            let cloze = shape
                .target_key()
                .and_then(|key| slots.iter().position(|slot| slot.as_deref() == Some(key)))
                .map_or(0, |index| index + 1);
            let props = match shape {
                OcclusionShape::Rect(mask) => format!(
                    "rect:{}:width={}:height={}{}",
                    position(mask.x, mask.y, mask.rotation),
                    number(mask.width),
                    number(mask.height),
                    style(mask, hide_all),
                ),
                OcclusionShape::Ellipse(mask) => format!(
                    "ellipse:{}:rx={}:ry={}{}",
                    position(mask.x, mask.y, mask.rotation),
                    number(mask.width / 2.0),
                    number(mask.height / 2.0),
                    style(mask, hide_all),
                ),
                // Anki splits properties at colons, so a label's own colons become ratio signs.
                OcclusionShape::Text(text) => format!(
                    "text:{}:text={}:scale=1:fs={}:fill={}",
                    position(text.x, text.y, text.rotation),
                    label_text(&text.text),
                    number(text.font_size),
                    text.color,
                ),
            };
            format!("{{{{c{cloze}::image-occlusion:{props}}}}}")
        })
        .collect::<Vec<_>>()
        .join("<br>")
}

/// Fields hold HTML, and `:` and `}` would end the property and the cloze.
fn label_text(text: &str) -> String {
    escape_html_text(text).replace(':', "∶").replace('}', ")")
}

fn position(x: f64, y: f64, rotation: f64) -> String {
    let angle = if rotation == 0.0 {
        String::new()
    } else {
        format!(":angle={}", number(rotation))
    };
    format!("left={}:top={}{angle}", number(x), number(y))
}

fn style(mask: &MaskShape, hide_all: bool) -> String {
    let hide_all = if hide_all { ":oi=1" } else { "" };
    format!(":fill={}{hide_all}", mask.fill)
}

/// Four decimals, as Anki writes them.
fn number(value: f64) -> String {
    let rounded = format!("{value:.4}");
    rounded
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::assets::value_objects::asset_id::AssetId;
    use crate::image_occlusion::value_objects::occlusion_shape::TextShape;
    use crate::import::anki::image_occlusion::parse_occlusions;

    fn mask(id: &str, group_id: Option<&str>) -> MaskShape {
        MaskShape {
            id: id.into(),
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
            rotation: 0.0,
            fill: "#ffeba2".into(),
            group_id: group_id.map(Into::into),
        }
    }

    fn occlusion(shapes: Vec<OcclusionShape>, mode: OcclusionMode) -> ImageOcclusion {
        ImageOcclusion {
            id: Uuid::new_v4(),
            name: "Heart".into(),
            image_asset_id: AssetId::from_bytes(b"image"),
            image_width: 100,
            image_height: 100,
            shapes,
            mode,
            parent_id: None,
        }
    }

    #[test]
    fn occlusion_field_grouped_masks_share_one_cloze() {
        // Arrange

        let occlusion = occlusion(
            vec![
                OcclusionShape::Rect(mask("a", Some("g"))),
                OcclusionShape::Ellipse(mask("b", Some("g"))),
                OcclusionShape::Rect(mask("c", None)),
            ],
            OcclusionMode::HideAllGuessOne,
        );

        let slots = cloze_slots(&[], &occlusion.target_keys());

        // Act

        let field = occlusion_field(&occlusion, &slots);

        // Assert

        assert_eq!(
            "{{c1::image-occlusion:rect:left=0.1:top=0.2:width=0.3:height=0.4:fill=#ffeba2:oi=1}}<br>\
             {{c1::image-occlusion:ellipse:left=0.1:top=0.2:rx=0.15:ry=0.2:fill=#ffeba2:oi=1}}<br>\
             {{c2::image-occlusion:rect:left=0.1:top=0.2:width=0.3:height=0.4:fill=#ffeba2:oi=1}}",
            field
        );
    }

    #[test]
    fn occlusion_field_round_trips_through_the_importer() {
        // Arrange

        let mut rotated = mask("a", None);
        rotated.rotation = 30.0;
        let occlusion = occlusion(
            vec![
                OcclusionShape::Rect(rotated),
                OcclusionShape::Text(TextShape {
                    id: "t".into(),
                    x: 0.5,
                    y: 0.5,
                    rotation: 0.0,
                    text: "A & B".into(),
                    font_size: 0.05,
                    color: "#000000".into(),
                }),
            ],
            OcclusionMode::HideOneGuessOne,
        );

        let slots = cloze_slots(&[], &occlusion.target_keys());

        // Act

        let (shapes, mode) = parse_occlusions(&occlusion_field(&occlusion, &slots), 100, 100);

        // Assert

        assert_eq!(OcclusionMode::HideOneGuessOne, mode);
        let OcclusionShape::Rect(rect) = &shapes[0] else {
            panic!("expected a rect");
        };
        assert_eq!((0.1, 0.2, 30.0), (rect.x, rect.y, rect.rotation));
        let OcclusionShape::Text(text) = &shapes[1] else {
            panic!("expected a label");
        };
        assert_eq!(("A & B", 0.05), (text.text.as_str(), text.font_size));
    }

    #[test]
    fn cloze_slots_removed_and_added_targets_keep_existing_numbers() {
        // Arrange

        let previous = vec![
            Some("a".to_string()),
            Some("b".to_string()),
            Some("c".to_string()),
        ];
        let targets = vec!["c".to_string(), "d".to_string(), "a".to_string()];

        // Act

        let slots = cloze_slots(&previous, &targets);

        // Assert

        assert_eq!(
            vec![Some("a".into()), None, Some("c".into()), Some("d".into())],
            slots
        );
    }
}
