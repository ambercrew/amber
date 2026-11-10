use serde::Deserialize;
use uuid::Uuid;

use super::create_meta_dto::CreateMetaDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderDto {
    /// Lets a caller that fills the folder right away know its id.
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    pub meta: CreateMetaDto,
}
