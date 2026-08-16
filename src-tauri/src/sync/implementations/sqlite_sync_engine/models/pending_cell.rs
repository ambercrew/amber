/// A single buffered column value, awaiting the row-level flush.
pub struct PendingCell {
    pub col: String,
    pub value: Option<Vec<u8>>,
}
