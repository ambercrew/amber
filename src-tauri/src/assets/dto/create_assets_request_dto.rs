use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetsRequestDto {
    /// Base64 `data:image/...` URIs.
    pub data_uris: Vec<String>,
}
