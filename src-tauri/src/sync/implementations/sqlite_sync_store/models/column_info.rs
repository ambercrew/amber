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
    /// Whether the column is `NOT NULL` — used to reject an `FkPolicy::SetNull`
    /// registered against it (see `register::register_table`).
    pub notnull: bool,
    /// Whether the column declares a `DEFAULT`. Together with `notnull` this
    /// identifies the columns an insert must supply itself, which is what makes
    /// a partially-buffered row unmaterializable (see
    /// `apply::log_incomplete_pending_rows`).
    pub has_default: bool,
}

impl ColumnInfo {
    /// A non-key column an `INSERT` must supply a value for, because it is
    /// `NOT NULL` and has no `DEFAULT` to fall back on.
    pub fn is_required_on_insert(&self) -> bool {
        !self.is_primary_key() && self.notnull && !self.has_default
    }
}

impl ColumnInfo {
    pub fn is_primary_key(&self) -> bool {
        self.pk_position.is_some()
    }
}
