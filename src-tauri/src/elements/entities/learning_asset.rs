use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::traits::Element;
use crate::elements::value_objects::meta::Meta;
use crate::elements::value_objects::read_point::ReadPoint;

/// Whether a learning asset's content is the original PDF file (rendered as a
/// page-accurate PDF) or was converted to Lexical text at import time (rendered
/// like any other document).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LearningAssetType {
    Pdf,
    #[default]
    Extracted,
}

impl LearningAssetType {
    pub fn as_str(&self) -> &'static str {
        match self {
            LearningAssetType::Pdf => "pdf",
            LearningAssetType::Extracted => "extracted",
        }
    }
}

impl std::str::FromStr for LearningAssetType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pdf" => Ok(LearningAssetType::Pdf),
            "extracted" => Ok(LearningAssetType::Extracted),
            other => Err(format!("Unknown learning asset type: {other}")),
        }
    }
}

/// A single chunk of a learning asset's content. Large learning assets are broken into splits so
/// that each can be reviewed independently; a non-split learning asset is just a single
/// split with `seq = 0`.
#[derive(Debug, Clone, PartialEq)]
pub struct LearningAssetSplit {
    pub seq: u32,
    pub content: String,
}

/// Identifies a single split within a learning asset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearningAssetSplitId {
    pub learning_asset_id: Uuid,
    pub seq: u32,
}

/// A learning asset's type-specific content at creation time, keeping the
/// `Pdf`/`Extracted` payloads mutually exclusive instead of two independently
/// optional fields.
#[derive(Debug, Clone)]
pub enum LearningAssetContent {
    Extracted(Vec<LearningAssetSplit>),
    Pdf { bytes: Vec<u8>, page_count: u32 },
}

/// Lightweight description of a split, without its content. Used to lay out the
/// learning asset view without loading every split into memory: `char_count` drives the
/// height estimate for splits that haven't been mounted yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearningAssetSplitMeta {
    pub seq: u32,
    pub char_count: u32,
}

/// Plain-text content of a split, without its Lexical JSON. Used to search splits
/// that haven't been mounted (and so have no live editor to search within).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearningAssetSplitText {
    pub seq: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LearningAsset {
    pub meta: Meta,
    /// Whether this is the original PDF file or Lexical text converted at import time.
    pub r#type: LearningAssetType,
    /// Where the user last read up to. Device-independent.
    pub read_point: ReadPoint,
    /// Interval multiplier applied each time this learning asset is revisited. Seeded from
    /// the effective study profile's `initial_interval_multiplier` at creation time and kept
    /// fixed afterwards, independent of later profile edits.
    pub interval_multiplier: f32,
}

impl Element for LearningAsset {
    fn meta(&self) -> &Meta {
        &self.meta
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_pdf_returns_pdf_string() {
        // Arrange

        let learning_asset_type = LearningAssetType::Pdf;

        // Act

        let actual = learning_asset_type.as_str();

        // Assert

        assert_eq!("pdf", actual);
    }

    #[test]
    fn from_str_pdf_string_returns_pdf_variant() {
        // Arrange

        // Act

        let actual = "pdf".parse::<LearningAssetType>().unwrap();

        // Assert

        assert_eq!(LearningAssetType::Pdf, actual);
    }

    #[test]
    fn from_str_extracted_string_returns_extracted_variant() {
        // Arrange

        // Act

        let actual = "extracted".parse::<LearningAssetType>().unwrap();

        // Assert

        assert_eq!(LearningAssetType::Extracted, actual);
    }

    #[test]
    fn from_str_unknown_string_returns_error() {
        // Arrange

        // Act

        let actual = "not-a-type".parse::<LearningAssetType>();

        // Assert

        assert!(actual.is_err());
    }
}
