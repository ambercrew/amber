use std::str::FromStr;

use uuid::fmt::Hyphenated;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;

pub struct ImageOcclusionRow {
    pub id: Hyphenated,
    pub name: String,
    pub image_asset_id: String,
    pub image_width: i64,
    pub image_height: i64,
    pub shapes: String,
    pub mode: String,
    pub parent_id: Option<Hyphenated>,
}

impl TryFrom<ImageOcclusionRow> for ImageOcclusion {
    type Error = RepositoryError;

    fn try_from(row: ImageOcclusionRow) -> Result<Self, Self::Error> {
        let shapes = serde_json::from_str(&row.shapes)
            .map_err(|err| RepositoryError::QueryFailed(Box::new(err)))?;
        let mode = OcclusionMode::from_str(&row.mode)
            .map_err(|err| RepositoryError::QueryFailed(err.into()))?;
        Ok(ImageOcclusion {
            id: row.id.into_uuid(),
            name: row.name,
            image_asset_id: AssetId::try_from(row.image_asset_id)
                .map_err(|err| RepositoryError::QueryFailed(Box::new(err)))?,
            image_width: row.image_width as u32,
            image_height: row.image_height as u32,
            shapes,
            mode,
            parent_id: row.parent_id.map(Hyphenated::into_uuid),
        })
    }
}
