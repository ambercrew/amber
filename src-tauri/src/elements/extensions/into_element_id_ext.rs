use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;

pub trait IntoElementIdExt {
    fn into_element_id(self) -> ElementId;
}

/// Rebuilds an [`ElementId`] from a row's `(element_id, element_type)`; an unknown type falls back to
/// `Card`, matching how the element tables are keyed.
impl IntoElementIdExt for (Uuid, String) {
    fn into_element_id(self) -> ElementId {
        match self.1.as_str() {
            "folder" => ElementId::Folder(self.0),
            "learning_asset" => ElementId::LearningAsset(self.0),
            "extract" => ElementId::Extract(self.0),
            _ => ElementId::Card(self.0),
        }
    }
}

pub trait IntoOptionalElementIdExt {
    fn into_element_id(self) -> Option<ElementId>;
}

impl IntoOptionalElementIdExt for (Option<Uuid>, Option<String>) {
    fn into_element_id(self) -> Option<ElementId> {
        match (self.0, self.1.as_deref()) {
            (Some(id), Some("folder")) => Some(ElementId::Folder(id)),
            (Some(id), Some("learning_asset")) => Some(ElementId::LearningAsset(id)),
            (Some(id), Some("extract")) => Some(ElementId::Extract(id)),
            (Some(id), Some("card")) => Some(ElementId::Card(id)),
            _ => None,
        }
    }
}
