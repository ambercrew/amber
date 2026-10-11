use serde::{Deserialize, Serialize};

/// Coordinates and sizes are normalized to the image (0..1); rotation is in degrees.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OcclusionShape {
    Rect(MaskShape),
    Ellipse(MaskShape),
    Text(TextShape),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskShape {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub rotation: f64,
    pub fill: String,
    #[serde(default)]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextShape {
    pub id: String,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub rotation: f64,
    pub text: String,
    pub font_size: f64,
    pub color: String,
}

impl OcclusionShape {
    /// The card a mask belongs to: its group, or the mask itself when ungrouped.
    /// Text labels never produce cards.
    pub fn target_key(&self) -> Option<&str> {
        match self {
            OcclusionShape::Rect(mask) | OcclusionShape::Ellipse(mask) => {
                Some(mask.group_id.as_deref().unwrap_or(&mask.id))
            }
            OcclusionShape::Text(_) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_rect_from_frontend_json_returns_mask() {
        // Arrange

        let json = r##"{"kind":"rect","id":"a","x":0.1,"y":0.2,"width":0.3,"height":0.4,"rotation":15,"fill":"#ff0000","groupId":"g"}"##;

        // Act

        let actual: OcclusionShape = serde_json::from_str(json).unwrap();

        // Assert

        assert_eq!(
            OcclusionShape::Rect(MaskShape {
                id: "a".into(),
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.4,
                rotation: 15.0,
                fill: "#ff0000".into(),
                group_id: Some("g".into()),
            }),
            actual
        );
    }

    #[test]
    fn serialize_text_round_trip_returns_same_shape() {
        // Arrange

        let shape = OcclusionShape::Text(TextShape {
            id: "t".into(),
            x: 0.5,
            y: 0.5,
            rotation: 0.0,
            text: "Aorta".into(),
            font_size: 0.04,
            color: "#000000".into(),
        });

        // Act

        let json = serde_json::to_string(&shape).unwrap();
        let actual: OcclusionShape = serde_json::from_str(&json).unwrap();

        // Assert

        assert!(json.contains(r#""kind":"text""#));
        assert!(json.contains(r#""fontSize""#));
        assert_eq!(shape, actual);
    }
}
