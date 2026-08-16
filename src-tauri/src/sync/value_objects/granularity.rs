use std::fmt;
use std::str::FromStr;

use crate::sync::errors::SyncError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Granularity {
    Column,
    Row,
}

impl fmt::Display for Granularity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Granularity::Column => write!(f, "column"),
            Granularity::Row => write!(f, "row"),
        }
    }
}

impl FromStr for Granularity {
    type Err = SyncError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "column" => Ok(Granularity::Column),
            "row" => Ok(Granularity::Row),
            other => Err(SyncError::InvalidGranularity(other.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_column_returns_column_string() {
        // Arrange

        let granularity = Granularity::Column;

        // Act

        let actual = granularity.to_string();

        // Assert

        assert_eq!("column", actual);
    }

    #[test]
    fn display_row_returns_row_string() {
        // Arrange

        let granularity = Granularity::Row;

        // Act

        let actual = granularity.to_string();

        // Assert

        assert_eq!("row", actual);
    }

    #[test]
    fn from_str_column_returns_column_variant() {
        // Arrange

        let input = "column";

        // Act

        let actual = Granularity::from_str(input).unwrap();

        // Assert

        assert_eq!(Granularity::Column, actual);
    }

    #[test]
    fn from_str_row_returns_row_variant() {
        // Arrange

        let input = "row";

        // Act

        let actual = Granularity::from_str(input).unwrap();

        // Assert

        assert_eq!(Granularity::Row, actual);
    }

    #[test]
    fn from_str_unknown_returns_error() {
        // Arrange

        let input = "bogus";

        // Act

        let actual = Granularity::from_str(input);

        // Assert

        assert!(actual.is_err());
    }
}
