use std::collections::HashMap;

use async_trait::async_trait;
use thiserror::Error;

use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::value_objects::occlusion_card_content::OcclusionCardContent;

#[derive(Error, Debug)]
pub enum OcclusionCardContentBuilderError {
    #[error("Failed to ask the frontend for the occlusion cards' content")]
    Emit,
    #[error("The frontend did not build the occlusion cards' content in time")]
    Timeout,
    #[error("The frontend returned invalid occlusion card content")]
    InvalidResponse,
}

/// Builds occlusion cards' content. The frontend owns the Lexical format, so the
/// backend never writes Lexical JSON by hand.
#[async_trait]
pub trait OcclusionCardContentBuilder: Send + Sync {
    /// One entry per key in `target_keys`.
    async fn build(
        &self,
        occlusion: &ImageOcclusion,
        target_keys: &[String],
    ) -> Result<HashMap<String, OcclusionCardContent>, OcclusionCardContentBuilderError>;
}
