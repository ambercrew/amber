use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPromptRequestDto {
    pub name: String,
    pub content: String,
}
