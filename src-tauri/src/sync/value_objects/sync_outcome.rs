use std::collections::HashSet;

/// Past this many rows a sync reports only that many changed, keeping the IPC payload small.
pub const MAX_REPORTED_ROWS: usize = 10_000;

/// The rows a sync applied remote cells to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncOutcome {
    /// Their `row_id`s, or `None` when more than `MAX_REPORTED_ROWS` changed.
    pub changed_row_ids: Option<HashSet<String>>,
}

impl SyncOutcome {
    pub fn new() -> Self {
        Self {
            changed_row_ids: Some(HashSet::new()),
        }
    }

    pub fn record(&mut self, row_ids: impl IntoIterator<Item = String>) {
        let Some(changed) = self.changed_row_ids.as_mut() else {
            return;
        };
        changed.extend(row_ids);
        if changed.len() > MAX_REPORTED_ROWS {
            self.changed_row_ids = None;
        }
    }
}

impl Default for SyncOutcome {
    fn default() -> Self {
        Self::new()
    }
}
