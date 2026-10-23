use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Number of mark slots each learning asset has.
pub const MARK_SLOT_COUNT: u8 = 3;

/// One of a learning asset's numbered mark slots, `1..=MARK_SLOT_COUNT`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub struct MarkSlot(u8);

#[derive(Debug, Error, PartialEq, Eq)]
#[error("{0} is not a mark slot (expected 1 to {MARK_SLOT_COUNT})")]
pub struct InvalidMarkSlot(pub u8);

impl MarkSlot {
    pub fn get(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for MarkSlot {
    type Error = InvalidMarkSlot;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if (1..=MARK_SLOT_COUNT).contains(&value) {
            Ok(MarkSlot(value))
        } else {
            Err(InvalidMarkSlot(value))
        }
    }
}

impl From<MarkSlot> for u8 {
    fn from(slot: MarkSlot) -> Self {
        slot.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_from_slot_in_range_returns_slot() {
        // Arrange

        let values = [1u8, 2, 3];

        // Act

        let actual: Vec<u8> = values
            .iter()
            .map(|value| MarkSlot::try_from(*value).unwrap().get())
            .collect();

        // Assert

        assert_eq!(vec![1, 2, 3], actual);
    }

    #[test]
    fn try_from_zero_returns_error() {
        // Arrange

        let value = 0u8;

        // Act

        let actual = MarkSlot::try_from(value);

        // Assert

        assert_eq!(Err(InvalidMarkSlot(0)), actual);
    }

    #[test]
    fn try_from_above_slot_count_returns_error() {
        // Arrange

        let value = MARK_SLOT_COUNT + 1;

        // Act

        let actual = MarkSlot::try_from(value);

        // Assert

        assert_eq!(Err(InvalidMarkSlot(MARK_SLOT_COUNT + 1)), actual);
    }

    #[test]
    fn deserialize_out_of_range_slot_returns_error() {
        // Arrange

        let json = "4";

        // Act

        let actual = serde_json::from_str::<MarkSlot>(json);

        // Assert

        assert!(actual.is_err());
    }
}
