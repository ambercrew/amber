/// Schema description used to generate sync triggers for a table. `columns`
/// holds every non-primary-key column; `pk_columns` is kept separate since it
/// is handled differently in every trigger body (encoded into `row_id`, and —
/// in row mode only — also folded back into the JSON payload). Ordered by the
/// key's column position so `row_id` is encoded/decoded consistently for
/// composite keys.
pub struct TableSchema {
    pub name: String,
    pub pk_columns: Vec<String>,
    pub columns: Vec<String>,
}
