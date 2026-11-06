use crate::assets::value_objects::asset_id::AssetId;
use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;
use crate::image_occlusion::value_objects::occlusion_shape::OcclusionShape;

/// One image occlusion, its image among the extraction's images.
pub struct AnkiOcclusion {
    pub name: String,
    pub image_asset_id: AssetId,
    pub image_width: u32,
    pub image_height: u32,
    pub shapes: Vec<OcclusionShape>,
    pub mode: OcclusionMode,
    pub tags: Vec<String>,
    /// The Anki card quizzing each target, by target key.
    pub anki_cards: Vec<(String, i64)>,
}
