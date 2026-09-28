/// Number of distinct elements of each studyable type reviewed on one day.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ElementCounts {
    pub learning_assets: i64,
    pub extracts: i64,
    pub cards: i64,
}
