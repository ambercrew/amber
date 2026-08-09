use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchRenameRequestDto {
    pub name: String,
}
