use serde::Serialize;
use uuid::Uuid;

/// Asks the frontend for occlusion cards' Lexical content; answered with a JSON object
/// mapping each target key to its `OcclusionCardContent`.
pub const BUILD_OCCLUSION_CARD_CONTENTS_EVENT: &str = "build-occlusion-card-contents";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildOcclusionCardContentsEventDto {
    pub occlusion_id: Uuid,
    /// The image's canonical `amber-asset:<id>` src.
    pub src: String,
    pub alt_text: String,
    pub target_keys: Vec<String>,
}
