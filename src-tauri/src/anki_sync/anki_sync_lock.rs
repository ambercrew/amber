use std::sync::atomic::{AtomicBool, Ordering};

use tokio::sync::{Mutex, MutexGuard};

/// Held for a whole Anki sync, so two overlapping runs can't each pull and push the same reviews.
#[derive(Default)]
pub struct AnkiSyncLock {
    running: Mutex<()>,
    /// Asks the running sync to stop at its next checkpoint.
    cancelled: AtomicBool,
}

impl AnkiSyncLock {
    /// Starts a sync, clearing an earlier cancellation; `None` while another one runs.
    pub fn try_start(&self) -> Option<MutexGuard<'_, ()>> {
        let guard = self.running.try_lock().ok()?;
        self.cancelled.store(false, Ordering::SeqCst);
        Some(guard)
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}
