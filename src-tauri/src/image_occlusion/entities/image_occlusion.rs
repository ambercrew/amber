use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;

#[derive(Debug, Clone, PartialEq)]
pub struct ImageOcclusion {
    pub id: Uuid,
    pub name: String,
    pub image_asset_id: AssetId,
    pub image_width: u32,
    pub image_height: u32,
    pub shapes: Vec<OcclusionShape>,
    pub mode: OcclusionMode,
    /// Where its cards were created, for new cards once no card is left to sit beside.
    pub parent_id: Option<Uuid>,
}

impl ImageOcclusion {
    /// One key per card to generate, unique and in shape order.
    pub fn target_keys(&self) -> Vec<String> {
        let mut keys: Vec<String> = Vec::new();
        for key in self.shapes.iter().filter_map(OcclusionShape::target_key) {
            if !keys.iter().any(|existing| existing == key) {
                keys.push(key.to_string());
            }
        }
        keys
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image_occlusion::value_objects::occlusion_shape::{MaskShape, TextShape};

    fn mask(id: &str, group_id: Option<&str>) -> MaskShape {
        MaskShape {
            id: id.into(),
            x: 0.0,
            y: 0.0,
            width: 0.1,
            height: 0.1,
            rotation: 0.0,
            fill: "#000".into(),
            group_id: group_id.map(Into::into),
        }
    }

    #[test]
    fn target_keys_grouped_and_text_shapes_returns_one_key_per_group_or_mask() {
        // Arrange

        let occlusion = ImageOcclusion {
            id: Uuid::new_v4(),
            name: "Heart".into(),
            image_asset_id: AssetId::from_bytes(b"image"),
            image_width: 100,
            image_height: 100,
            shapes: vec![
                OcclusionShape::Rect(mask("a", None)),
                OcclusionShape::Ellipse(mask("b", Some("g1"))),
                OcclusionShape::Text(TextShape {
                    id: "t".into(),
                    x: 0.0,
                    y: 0.0,
                    rotation: 0.0,
                    text: "label".into(),
                    font_size: 0.05,
                    color: "#000".into(),
                }),
                OcclusionShape::Rect(mask("c", Some("g1"))),
                OcclusionShape::Rect(mask("d", None)),
            ],
            mode: OcclusionMode::HideAllGuessOne,
            parent_id: None,
        };

        // Act

        let actual = occlusion.target_keys();

        // Assert

        assert_eq!(vec!["a", "g1", "d"], actual);
    }
}
