/// Column metadata read via `PRAGMA table_info`, used to generate sync
/// triggers and to translate `apply_remote` cell changes back into typed SQL.
#[derive(Debug, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: String,
    /// `None` for non-key columns, otherwise the column's 1-based position
    /// within the (possibly composite) primary key — needed to encode/decode
    /// `row_id` in a stable column order.
    pub pk_position: Option<u32>,
}

impl ColumnInfo {
    pub fn is_primary_key(&self) -> bool {
        self.pk_position.is_some()
    }
}
