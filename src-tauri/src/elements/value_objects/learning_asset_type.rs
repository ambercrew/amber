use serde::{Deserialize, Serialize};

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
