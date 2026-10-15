use std::sync::atomic::{AtomicBool, Ordering};

use tokio::sync::{Mutex, MutexGuard, Notify};

/// Manages the state and lifecycle of AI model calls.
///
/// This struct ensures that only one AI generation can run at a time and provides
/// a mechanism to cancel ongoing generations. It uses interior mutability to allow
/// cancellation from multiple threads safely.
pub struct AiState {
    /// Ensures only one AI generation runs at a time.
    generation_lock: Mutex<()>,

    /// Atomic flag for canceling the current generation. Set to `false` on start,
    /// checked periodically during execution, and set to `true` to request cancellation.
    cancel_current_call: AtomicBool,

    /// Wakes `cancelled()` waiters, so a pending network call is dropped right away.
    cancel_notify: Notify,
}

impl AiState {
    pub fn cancel_generation(&self) {
        self.cancel_current_call.store(true, Ordering::Relaxed);
        self.cancel_notify.notify_waiters();
    }

    pub(in crate::ai_integration) async fn start_generation(&self) -> MutexGuard<'_, ()> {
        let lock = self.generation_lock.lock().await;
        self.cancel_current_call.store(false, Ordering::Relaxed);
        lock
    }

    pub(in crate::ai_integration) fn generation_cancelled(&self) -> bool {
        self.cancel_current_call.load(Ordering::Relaxed)
    }

    /// Resolves once the current generation is cancelled; race an await against it.
    pub(in crate::ai_integration) async fn cancelled(&self) {
        loop {
            let notified = self.cancel_notify.notified();
            tokio::pin!(notified);
            // Registered before checking the flag, so a cancel in between isn't missed.
            notified.as_mut().enable();
            if self.generation_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

impl Default for AiState {
    fn default() -> Self {
        Self {
            generation_lock: Mutex::new(()),
            cancel_current_call: AtomicBool::new(false),
            cancel_notify: Notify::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use super::*;

    #[tokio::test]
    async fn cancelled_generation_cancelled_while_waiting_resolved() {
        // Arrange

        let state = Arc::new(AiState::default());
        let _guard = state.start_generation().await;
        let waiting_state = state.clone();
        let waiter = tokio::spawn(async move { waiting_state.cancelled().await });
        tokio::task::yield_now().await;

        // Act

        state.cancel_generation();

        // Assert

        tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("cancelled() should resolve once the generation is cancelled")
            .unwrap();
    }

    #[tokio::test]
    async fn cancelled_generation_already_cancelled_resolved_immediately() {
        // Arrange

        let state = AiState::default();
        let _guard = state.start_generation().await;
        state.cancel_generation();

        // Act

        let actual = tokio::time::timeout(Duration::from_millis(100), state.cancelled()).await;

        // Assert

        assert!(actual.is_ok());
    }

    #[tokio::test]
    async fn cancelled_generation_not_cancelled_stayed_pending() {
        // Arrange

        let state = AiState::default();
        let _guard = state.start_generation().await;

        // Act

        let actual = tokio::time::timeout(Duration::from_millis(50), state.cancelled()).await;

        // Assert

        assert!(actual.is_err());
    }
}
