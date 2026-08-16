/// Identifies the base-table row a buffered column update belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RowKey {
    pub tbl: String,
    pub row_id: String,
}
