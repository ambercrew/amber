use std::sync::Mutex;

use super::{DeviceId, Hlc, observe, tick, wall_time_ms};

/// Process-wide HLC state. Never persisted directly: on startup it is reseeded
/// from `max(hlc)` over `sync_cells` merged with wall time. Every HLC this device
/// ever emitted, and every remote HLC that ever won a merge, ends up in
/// `sync_cells` (tombstones are kept forever), so that reseed can never reissue a
/// duplicate or backwards-moving HLC across restarts.
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

    /// This device's persistent id, as seeded into the clock at construction.
    /// `tick`/`observe` never change it, so it's stable for the clock's lifetime.
    pub fn device_id(&self) -> DeviceId {
        self.state
            .lock()
            .expect("HLC clock mutex poisoned")
            .device_id
    }
}
