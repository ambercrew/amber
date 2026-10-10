use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetRequestDto {
    /// A base64 `data:image/...` URI.
    pub data_uri: String,
}
