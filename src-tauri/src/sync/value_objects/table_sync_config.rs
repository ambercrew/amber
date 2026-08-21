use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::granularity::Granularity;

/// A synced table's tracking granularity plus the FK repair policies for its
/// dangling-reference-prone columns (see `FkPolicy`).
pub struct TableSyncConfig {
    pub name: &'static str,
    pub granularity: Granularity,
    pub fk_constraints: Vec<FkConstraint>,
}
