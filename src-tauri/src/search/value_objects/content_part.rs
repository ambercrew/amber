use crate::elements::value_objects::element_id::ElementId;

/// One searchable text of an element, in the order find in page walks them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContentPart {
    LearningAssetSplit(u32),
    Extract,
    CardFront,
    CardBack,
}

/// A content part that may contain the query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContentPartRef {
    pub element_id: ElementId,
    pub part: ContentPart,
}
