use uuid::Uuid;

use crate::elements::value_objects::mark_slot::MarkSlot;
use crate::elements::value_objects::reading_position::ReadingPosition;

/// A position the reader placed in one of a learning asset's numbered slots.
/// Anchored exactly like the read point, but never moved automatically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearningAssetMark {
    pub learning_asset_id: Uuid,
    pub slot: MarkSlot,
    pub anchor: ReadingPosition,
}
