/// Column metadata read via `PRAGMA table_info`, used to generate sync
/// triggers and to translate `apply_remote` cell changes back into typed SQL.
#[derive(Debug, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: String,
    /// `None` for non-key columns, otherwise the column's 1-based position within
    /// the primary key, which fixes `row_id`'s column order.
    pub pk_position: Option<u32>,
    /// Whether the column is `NOT NULL` — used to reject an `FkPolicy::SetNull`
    /// registered against it (see `register::register_table`).
    pub notnull: bool,
    /// Whether the column declares a `DEFAULT`. With `notnull`, this identifies
    /// the columns an insert must supply itself.
    pub has_default: bool,
}

impl ColumnInfo {
    /// A non-key column an `INSERT` must supply: `NOT NULL` with no `DEFAULT`.
    pub fn is_required_on_insert(&self) -> bool {
        !self.is_primary_key() && self.notnull && !self.has_default
    }
}

impl ColumnInfo {
    pub fn is_primary_key(&self) -> bool {
        self.pk_position.is_some()
    }
}
