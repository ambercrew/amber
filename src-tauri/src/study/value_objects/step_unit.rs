use std::fmt;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;

static STEP_UNIT_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\d+(\.\d+)?[mhd]$").expect("valid step unit regex"));

/// Mirrors ts-fsrs's own `StepUnit`: a positive amount of time expressed as a
/// number followed by a unit ("m"inutes, "h"ours or "d"ays), e.g. "1m",
/// "10m", "1d". Used for the same-day learning/relearning step lists on a
/// `StudyProfile`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StepUnit(String);

#[derive(Debug, Error, PartialEq, Eq)]
#[error("\"{0}\" is not a valid step (expected a number followed by m, h or d, e.g. \"10m\")")]
pub struct InvalidStepUnit(pub String);

impl TryFrom<String> for StepUnit {
    type Error = InvalidStepUnit;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if STEP_UNIT_PATTERN.is_match(&value) {
            Ok(StepUnit(value))
        } else {
            Err(InvalidStepUnit(value))
        }
    }
}

impl fmt::Display for StepUnit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Serialize for StepUnit {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for StepUnit {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        StepUnit::try_from(value).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_from_valid_formats_returns_ok() {
        // Arrange

        let values = ["1m", "10m", "1h", "1d", "10.5h"];

        // Act & Assert

        for value in values {
            assert!(StepUnit::try_from(value.to_string()).is_ok());
        }
    }

    #[test]
    fn try_from_invalid_format_returns_err() {
        // Arrange

        let values = ["", "m", "1", "1x", "-1m", "1m2"];

        // Act & Assert

        for value in values {
            assert!(StepUnit::try_from(value.to_string()).is_err());
        }
    }

    #[test]
    fn serde_round_trip_valid_step_returns_same_value() {
        // Arrange

        let step = StepUnit::try_from("10m".to_string()).unwrap();

        // Act

        let json = serde_json::to_string(&step).unwrap();
        let actual: StepUnit = serde_json::from_str(&json).unwrap();

        // Assert

        assert_eq!(step, actual);
    }

    #[test]
    fn deserialize_invalid_format_returns_err() {
        // Arrange

        let json = "\"1x\"";

        // Act

        let actual: Result<StepUnit, _> = serde_json::from_str(json);

        // Assert

        assert!(actual.is_err());
    }
}
