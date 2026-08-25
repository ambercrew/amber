use std::sync::Mutex;

use super::{DeviceId, Hlc, observe, tick, wall_time_ms};

/// In-memory HLC state. Never persisted directly: on startup it is reseeded from
/// `max(hlc)` over `sync_cells` merged with wall time, so a restart can never
/// reissue a duplicate or backwards-moving HLC.
pub struct HlcClock {
    state: Mutex<Hlc>,
}

impl HlcClock {
    pub fn new(seed: Hlc) -> Self {
        Self {
            state: Mutex::new(seed),
        }
    }

    pub fn now(&self) -> Hlc {
        let mut guard = self.state.lock().expect("HLC clock mutex poisoned");
        let next = tick(&guard, wall_time_ms());
        *guard = next.clone();
        next
    }

    pub fn observe(&self, remote: &Hlc) -> Hlc {
        let mut guard = self.state.lock().expect("HLC clock mutex poisoned");
        let next = observe(&guard, remote, wall_time_ms());
        *guard = next.clone();
        next
    }

    /// This device's persistent id, fixed at construction.
    pub fn device_id(&self) -> DeviceId {
        self.state
            .lock()
            .expect("HLC clock mutex poisoned")
            .device_id
    }
}
