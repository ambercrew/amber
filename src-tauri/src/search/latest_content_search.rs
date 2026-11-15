use std::sync::atomic::{AtomicU64, Ordering};

/// Numbers global content searches as they start, so an older one still running can stop
/// once a newer one begins: typing in bursts would otherwise queue searches up.
#[derive(Default)]
pub struct LatestContentSearch(AtomicU64);

impl LatestContentSearch {
    /// Starts a search, superseding every earlier one, and returns its number.
    pub fn start(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Whether a search started after `search`.
    pub fn is_superseded(&self, search: u64) -> bool {
        self.0.load(Ordering::SeqCst) != search
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_superseded_newer_search_started_returns_true_for_older_only() {
        // Arrange

        let latest = LatestContentSearch::default();
        let older = latest.start();
        let newer = latest.start();

        // Act

        let actual = (latest.is_superseded(older), latest.is_superseded(newer));

        // Assert

        assert_eq!((true, false), actual);
    }
}
