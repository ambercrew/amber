use tokio::sync::watch;

/// Signals that a sync cycle has committed since launch, for work that must not
/// run on data older than the remote's (it would win last-writer-wins otherwise).
pub struct SyncCompletion(watch::Sender<bool>);

impl Default for SyncCompletion {
    fn default() -> Self {
        Self(watch::Sender::new(false))
    }
}

impl SyncCompletion {
    pub fn mark_completed(&self) {
        self.0.send_replace(true);
    }

    pub async fn wait(&self) {
        // The sender lives as long as `self`, so the channel can't close.
        let _ = self.0.subscribe().wait_for(|completed| *completed).await;
    }
}
