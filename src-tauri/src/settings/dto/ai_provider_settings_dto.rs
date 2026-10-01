use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettingsDto {
    pub model_name: Option<String>,
    pub embeddings_model_name: Option<String>,
    /// Whether an API key is stored; the key itself never leaves the backend.
    pub api_key_is_set: bool,
}
