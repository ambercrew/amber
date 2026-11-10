use std::time::Instant;

/// Logs how long each phase of a sync took, to see what makes one slow.
pub(super) struct PhaseTimer {
    started: Instant,
    last: Instant,
}

impl PhaseTimer {
    pub(super) fn start() -> Self {
        let now = Instant::now();
        Self {
            started: now,
            last: now,
        }
    }

    pub(super) fn lap(&mut self, phase: &str) {
        let now = Instant::now();
        log::info!("Anki sync: {phase} took {:?}", now - self.last);
        self.last = now;
    }

    pub(super) fn finish(&self) {
        log::info!("Anki sync: finished in {:?}", self.started.elapsed());
    }
}
