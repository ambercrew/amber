use crate::sync::value_objects::fk_policy::FkPolicy;
use crate::sync::value_objects::granularity::Granularity;

/// One foreign-key relationship a synced table declares for a column, and
/// what to do with a row whose reference turns out to be dangling.
#[derive(Debug, Clone)]
pub struct FkConstraint {
    pub column: String,
    pub referenced_table: String,
    pub referenced_column: String,
    pub policy: FkPolicy,
}

impl FkConstraint {
    pub fn new(
        column: impl Into<String>,
        referenced_table: impl Into<String>,
        referenced_column: impl Into<String>,
        policy: FkPolicy,
    ) -> Self {
        Self {
            column: column.into(),
            referenced_table: referenced_table.into(),
            referenced_column: referenced_column.into(),
            policy,
        }
    }
}

/// A synced table's tracking granularity plus the FK repair policies for its
/// dangling-reference-prone columns (see `FkPolicy`).
pub struct TableSyncConfig {
    pub name: &'static str,
    pub granularity: Granularity,
    pub fk_constraints: Vec<FkConstraint>,
}
