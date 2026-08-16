use std::fmt;
use std::str::FromStr;

use uuid::Uuid;

/// The persistent id of a device participating in sync, backed by a UUID
/// rather than a bare `String` so a malformed id can't silently propagate
/// through HLC comparisons and merges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct DeviceId(Uuid);

impl DeviceId {
    pub fn new_v4() -> Self {
        Self(Uuid::new_v4())
    }

    /// Deterministically derives a `DeviceId` from a name, so tests can use
    /// readable labels (e.g. `"device-a"`) instead of literal UUIDs.
    #[cfg(test)]
    pub fn from_name(name: &str) -> Self {
        use std::hash::{Hash, Hasher};

        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        name.hash(&mut hasher);
        Self(Uuid::from_u128(hasher.finish() as u128))
    }
}

impl From<Uuid> for DeviceId {
    fn from(id: Uuid) -> Self {
        Self(id)
    }
}

impl fmt::Display for DeviceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for DeviceId {
    type Err = uuid::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(Uuid::parse_str(s)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_name_same_name_returns_equal_ids() {
        // Arrange

        // Act

        let actual = DeviceId::from_name("device-a");

        // Assert

        assert_eq!(DeviceId::from_name("device-a"), actual);
    }

    #[test]
    fn from_name_different_names_returns_different_ids() {
        // Arrange

        // Act

        let actual = DeviceId::from_name("device-a");

        // Assert

        assert_ne!(DeviceId::from_name("device-b"), actual);
    }

    #[test]
    fn display_from_str_roundtrip_preserves_id() {
        // Arrange

        let id = DeviceId::new_v4();

        // Act

        let actual: DeviceId = id.to_string().parse().unwrap();

        // Assert

        assert_eq!(id, actual);
    }
}
