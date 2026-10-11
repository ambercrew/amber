use std::str::FromStr;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OcclusionMode {
    /// Every mask is covered; only the target is revealed on the answer.
    HideAllGuessOne,
    /// Only the target is covered; the other masks stay visible.
    HideOneGuessOne,
}

impl OcclusionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            OcclusionMode::HideAllGuessOne => "hideAllGuessOne",
            OcclusionMode::HideOneGuessOne => "hideOneGuessOne",
        }
    }
}

impl FromStr for OcclusionMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "hideAllGuessOne" => Ok(OcclusionMode::HideAllGuessOne),
            "hideOneGuessOne" => Ok(OcclusionMode::HideOneGuessOne),
            other => Err(format!("Unknown occlusion mode: {other}")),
        }
    }
}
