use uuid::fmt::Hyphenated;

use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;

pub struct ImageOcclusionCardLinkRow {
    pub card_id: Hyphenated,
    pub occlusion_id: Hyphenated,
    pub target_key: String,
}

impl From<ImageOcclusionCardLinkRow> for ImageOcclusionCardLink {
    fn from(row: ImageOcclusionCardLinkRow) -> Self {
        ImageOcclusionCardLink {
            card_id: row.card_id.into_uuid(),
            occlusion_id: row.occlusion_id.into_uuid(),
            target_key: row.target_key,
        }
    }
}
