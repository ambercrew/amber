use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchContentRequestDto {
    pub query: String,
    pub case_sensitive: bool,
}
