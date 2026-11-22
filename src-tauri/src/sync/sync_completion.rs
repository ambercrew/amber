use tokio::sync::watch;

/// Signals that a sync cycle has committed since launch, for work that must not
/// run on data older than the remote's (it would win last-writer-wins otherwise).
/// It also records a finished attempt, failed or not, for work that only avoids the startup sync.
pub struct SyncCompletion {
    completed: watch::Sender<bool>,
    attempted: watch::Sender<bool>,
}

impl Default for SyncCompletion {
    fn default() -> Self {
        Self {
            completed: watch::Sender::new(false),
            attempted: watch::Sender::new(false),
        }
    }
}

impl SyncCompletion {
    pub fn mark_completed(&self) {
        self.completed.send_replace(true);
        self.mark_attempted();
    }

    pub fn mark_attempted(&self) {
        self.attempted.send_replace(true);
    }

    pub async fn wait(&self) {
        Self::wait_for(&self.completed).await;
    }

    pub async fn wait_attempted(&self) {
        Self::wait_for(&self.attempted).await;
    }

    async fn wait_for(signal: &watch::Sender<bool>) {
        // The sender lives as long as `self`, so the channel can't close.
        let _ = signal.subscribe().wait_for(|done| *done).await;
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[tokio::test]
    async fn wait_attempted_after_failed_attempt_returns() {
        // Arrange

        let completion = SyncCompletion::default();

        // Act

        completion.mark_attempted();

        // Assert

        tokio::time::timeout(Duration::from_secs(1), completion.wait_attempted())
            .await
            .expect("an attempt was marked");
    }

    #[tokio::test]
    async fn wait_after_failed_attempt_keeps_waiting() {
        // Arrange

        let completion = SyncCompletion::default();

        // Act

        completion.mark_attempted();

        // Assert

        let waited = tokio::time::timeout(Duration::from_millis(50), completion.wait()).await;
        assert!(waited.is_err());
    }

    #[tokio::test]
    async fn wait_attempted_after_completion_returns() {
        // Arrange

        let completion = SyncCompletion::default();

        // Act

        completion.mark_completed();

        // Assert

        tokio::time::timeout(Duration::from_secs(1), completion.wait_attempted())
            .await
            .expect("a completion is also an attempt");
    }
}
