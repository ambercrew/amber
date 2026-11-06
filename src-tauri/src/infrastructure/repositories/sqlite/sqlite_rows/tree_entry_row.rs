use fractional_index::FractionalIndex;
use sqlx::FromRow;
use uuid::fmt::Hyphenated;

use crate::elements::extensions::into_element_id_ext::{
    IntoElementIdExt, IntoOptionalElementIdExt,
};
use crate::elements::value_objects::tree_entry::TreeEntry;

#[derive(FromRow)]
pub struct TreeEntryRow {
    pub element_id: Hyphenated,
    pub element_type: String,
    pub name: String,
    pub position: Vec<u8>,
    pub parent_id: Option<Hyphenated>,
    pub parent_type: Option<String>,
}

impl From<TreeEntryRow> for TreeEntry {
    fn from(row: TreeEntryRow) -> Self {
        TreeEntry {
            element_id: (row.element_id.into_uuid(), row.element_type).into_element_id(),
            parent: (row.parent_id.map(Hyphenated::into_uuid), row.parent_type).into_element_id(),
            name: row.name,
            position: FractionalIndex::from_bytes(row.position).expect("Invalid fractional index"),
        }
    }
}
