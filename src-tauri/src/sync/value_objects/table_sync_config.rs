use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::granularity::Granularity;

/// A synced table's tracking granularity plus the FK repair policies for its
/// dangling-reference-prone columns (see `FkPolicy`).
pub struct TableSyncConfig {
    pub name: &'static str,
    pub granularity: Granularity,
    pub fk_constraints: Vec<FkConstraint>,
    /// SQL condition (primary key bound as `?1`, `?2`, …) under which a remote delete
    /// is refused and the row re-pushed, resurrecting it everywhere.
    pub delete_guard: Option<&'static str>,
}
