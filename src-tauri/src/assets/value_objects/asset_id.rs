use std::fmt::Display;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

/// Prefix of the canonical `src` persisted in content for a stored asset.
pub const ASSET_SRC_PREFIX: &str = "amber-asset:";

/// A content-addressed asset id: the lowercase hex SHA-256 of the asset's bytes.
/// Not a UUID, so identical bytes get the same id on every device.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct AssetId(String);

#[derive(Debug, Error)]
#[error("'{0}' is not an asset id")]
pub struct InvalidAssetId(pub String);

impl AssetId {
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self(
            Sha256::digest(bytes)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
        )
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The `amber-asset:<id>` value persisted as an image `src`.
    pub fn src(&self) -> String {
        format!("{ASSET_SRC_PREFIX}{}", self.0)
    }
}

impl TryFrom<String> for AssetId {
    type Error = InvalidAssetId;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let is_sha256_hex = value.len() == 64
            && value
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
        if is_sha256_hex {
            Ok(Self(value))
        } else {
            Err(InvalidAssetId(value))
        }
    }
}

impl From<AssetId> for String {
    fn from(id: AssetId) -> Self {
        id.0
    }
}

impl Display for AssetId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_bytes_same_bytes_returns_same_valid_id() {
        // Arrange

        let bytes = b"image bytes";

        // Act

        let first = AssetId::from_bytes(bytes);
        let second = AssetId::from_bytes(bytes);

        // Assert

        assert_eq!(first, second);
        assert!(AssetId::try_from(first.to_string()).is_ok());
    }

    #[test]
    fn try_from_uppercase_hex_returns_error() {
        // Arrange

        let value = "A".repeat(64);

        // Act

        let actual = AssetId::try_from(value);

        // Assert

        assert!(actual.is_err());
    }

    #[test]
    fn try_from_data_uri_returns_error() {
        // Arrange

        let value = "data:image/png;base64,AAAA".to_string();

        // Act

        let actual = AssetId::try_from(value);

        // Assert

        assert!(actual.is_err());
    }

    #[test]
    fn deserialize_invalid_id_returns_error() {
        // Arrange

        let json = r#""not-an-id""#;

        // Act

        let actual = serde_json::from_str::<AssetId>(json);

        // Assert

        assert!(actual.is_err());
    }
}
