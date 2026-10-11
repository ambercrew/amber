use serde::Deserialize;

/// Lexical JSON for both sides of one occlusion card.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct OcclusionCardContent {
    pub front: String,
    pub back: String,
}
