use crate::assets::value_objects::asset_id::AssetId;

/// An immutable, content-addressed image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub id: AssetId,
    pub mime_type: String,
    pub data: Vec<u8>,
}
