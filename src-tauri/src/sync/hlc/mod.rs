mod clock;
mod device_id;

use std::time::{SystemTime, UNIX_EPOCH};

use crate::sync::errors::SyncError;

pub use clock::HlcClock;
pub use device_id::DeviceId;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Hlc {
    pub physical_ms: u64,
    pub counter: u32,
    pub device_id: DeviceId,
}

impl Hlc {
    pub fn new(physical_ms: u64, counter: u32, device_id: impl Into<DeviceId>) -> Self {
        Self {
            physical_ms,
            counter,
            device_id: device_id.into(),
        }
    }

    /// Fixed-width zero-padded fields so plain TEXT comparison in SQLite sorts
    /// lexicographically in the same order as causal (physical, counter) order.
    pub fn format(&self) -> String {
        format!(
            "{:015}-{:08X}-{}",
            self.physical_ms, self.counter, self.device_id
        )
    }

    pub fn parse(value: &str) -> Result<Self, SyncError> {
        let mut parts = value.splitn(3, '-');
        let physical_part = parts
            .next()
            .ok_or_else(|| SyncError::InvalidHlc(value.to_string()))?;
        let counter_part = parts
            .next()
            .ok_or_else(|| SyncError::InvalidHlc(value.to_string()))?;
        let device_id = parts
            .next()
            .ok_or_else(|| SyncError::InvalidHlc(value.to_string()))?;

        if device_id.is_empty() {
            return Err(SyncError::InvalidHlc(value.to_string()));
        }

        let physical_ms = physical_part
            .parse::<u64>()
            .map_err(|_| SyncError::InvalidHlc(value.to_string()))?;
        let counter = u32::from_str_radix(counter_part, 16)
            .map_err(|_| SyncError::InvalidHlc(value.to_string()))?;
        let device_id = device_id
            .parse::<DeviceId>()
            .map_err(|_| SyncError::InvalidHlc(value.to_string()))?;

        Ok(Hlc {
            physical_ms,
            counter,
            device_id,
        })
    }
}

/// Local event: advance past wall time, bumping the counter only when physical
/// time didn't move forward (keeps the clock monotonic under a backwards or
/// stalled system clock).
pub fn tick(state: &Hlc, wall_ms: u64) -> Hlc {
    let physical_ms = state.physical_ms.max(wall_ms);
    let counter = if physical_ms > state.physical_ms {
        0
    } else {
        state.counter + 1
    };

    Hlc {
        physical_ms,
        counter,
        device_id: state.device_id.clone(),
    }
}

/// Standard HLC merge on receipt of a remote timestamp: advance past whichever
/// of local, remote, or wall time is greatest, bumping the counter from
/// whichever side tied for the max (reset to 0 if wall time alone advanced it).
pub fn observe(state: &Hlc, remote: &Hlc, wall_ms: u64) -> Hlc {
    let physical_ms = state.physical_ms.max(remote.physical_ms).max(wall_ms);

    let counter = if physical_ms == state.physical_ms && physical_ms == remote.physical_ms {
        state.counter.max(remote.counter) + 1
    } else if physical_ms == state.physical_ms {
        state.counter + 1
    } else if physical_ms == remote.physical_ms {
        remote.counter + 1
    } else {
        0
    };

    Hlc {
        physical_ms,
        counter,
        device_id: state.device_id.clone(),
    }
}

fn wall_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_parse_roundtrip_preserves_fields() {
        // Arrange

        let hlc = Hlc::new(1_700_000_000_123, 42, DeviceId::from_name("device-a"));

        // Act

        let actual = Hlc::parse(&hlc.format()).unwrap();

        // Assert

        assert_eq!(hlc, actual);
    }

    #[test]
    fn format_lexicographic_order_matches_causal_order_on_counter_hex_carry() {
        // Arrange

        let lower = Hlc::new(1000, 0xFF, DeviceId::from_name("device-a"));
        let higher = Hlc::new(1000, 0x100, DeviceId::from_name("device-a"));

        // Act

        let lower_str = lower.format();
        let higher_str = higher.format();

        // Assert

        assert!(lower_str < higher_str);
    }

    #[test]
    fn format_lexicographic_order_matches_causal_order_on_physical_carry() {
        // Arrange

        let lower = Hlc::new(999, 0xFFFFFFFF, DeviceId::from_name("device-a"));
        let higher = Hlc::new(1000, 0, DeviceId::from_name("device-a"));

        // Act

        let lower_str = lower.format();
        let higher_str = higher.format();

        // Assert

        assert!(lower_str < higher_str);
    }

    #[test]
    fn tick_wall_ahead_resets_counter() {
        // Arrange

        let state = Hlc::new(1000, 5, DeviceId::from_name("device-a"));

        // Act

        let actual = tick(&state, 2000);

        // Assert

        assert_eq!(Hlc::new(2000, 0, DeviceId::from_name("device-a")), actual);
    }

    #[test]
    fn tick_wall_behind_increments_counter() {
        // Arrange

        let state = Hlc::new(1000, 5, DeviceId::from_name("device-a"));

        // Act

        let actual = tick(&state, 500);

        // Assert

        assert_eq!(Hlc::new(1000, 6, DeviceId::from_name("device-a")), actual);
    }

    #[test]
    fn observe_remote_ahead_advances_past_remote() {
        // Arrange

        let state = Hlc::new(1000, 5, DeviceId::from_name("device-a"));
        let remote = Hlc::new(2000, 3, DeviceId::from_name("device-b"));

        // Act

        let actual = observe(&state, &remote, 100);

        // Assert

        assert_eq!(Hlc::new(2000, 4, DeviceId::from_name("device-a")), actual);
    }

    #[test]
    fn observe_remote_behind_keeps_local_and_increments() {
        // Arrange

        let state = Hlc::new(2000, 5, DeviceId::from_name("device-a"));
        let remote = Hlc::new(1000, 9, DeviceId::from_name("device-b"));

        // Act

        let actual = observe(&state, &remote, 100);

        // Assert

        assert_eq!(Hlc::new(2000, 6, DeviceId::from_name("device-a")), actual);
    }

    #[test]
    fn observe_equal_physical_takes_max_counter_plus_one() {
        // Arrange

        let state = Hlc::new(1000, 3, DeviceId::from_name("device-a"));
        let remote = Hlc::new(1000, 9, DeviceId::from_name("device-b"));

        // Act

        let actual = observe(&state, &remote, 100);

        // Assert

        assert_eq!(Hlc::new(1000, 10, DeviceId::from_name("device-a")), actual);
    }

    #[test]
    fn parse_malformed_returns_invalid_hlc_error() {
        // Arrange

        let input = "not-a-valid-hlc";

        // Act

        let actual = Hlc::parse(input);

        // Assert

        assert!(matches!(actual, Err(SyncError::InvalidHlc(_))));
    }

    #[test]
    fn parse_non_numeric_physical_returns_invalid_hlc_error() {
        // Arrange

        let input = "abcdefghijklmno-0000002A-device-a";

        // Act

        let actual = Hlc::parse(input);

        // Assert

        assert!(matches!(actual, Err(SyncError::InvalidHlc(_))));
    }
}
