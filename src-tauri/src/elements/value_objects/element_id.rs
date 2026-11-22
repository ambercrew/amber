use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A kind-tagged handle to any element. Field-level references keep their precise typed id, so the
/// compiler still stops them being mixed up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type", content = "id", rename_all = "camelCase")]
pub enum ElementId {
    Folder(Uuid),
    LearningAsset(Uuid),
    Extract(Uuid),
    Card(Uuid),
}

impl ElementId {
    pub fn id(&self) -> Uuid {
        match self {
            ElementId::Folder(id)
            | ElementId::LearningAsset(id)
            | ElementId::Extract(id)
            | ElementId::Card(id) => *id,
        }
    }

    pub fn element_name(&self) -> &'static str {
        match self {
            ElementId::Folder(_) => "folder",
            ElementId::LearningAsset(_) => "learning_asset",
            ElementId::Extract(_) => "extract",
            ElementId::Card(_) => "card",
        }
    }
}
