use serde::{Deserialize, Serialize};

/// Whether an element's name was chosen (by the user, an import, …) or follows its content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NameSource {
    #[default]
    Manual,
    /// Derived by `auto_name` and kept in step with the content until the user renames it.
    Automatic,
}

impl NameSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            NameSource::Manual => "manual",
            NameSource::Automatic => "automatic",
        }
    }
}

impl std::str::FromStr for NameSource {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "manual" => Ok(NameSource::Manual),
            "automatic" => Ok(NameSource::Automatic),
            other => Err(format!("Unknown name source: {other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_str_as_str_output_returns_same_variant() {
        // Arrange

        let sources = [NameSource::Manual, NameSource::Automatic];

        // Act

        let actual: Vec<NameSource> = sources
            .iter()
            .map(|source| source.as_str().parse().unwrap())
            .collect();

        // Assert

        assert_eq!(sources.to_vec(), actual);
    }

    #[test]
    fn from_str_unknown_string_returns_error() {
        // Arrange

        let input = "other";

        // Act

        let actual = input.parse::<NameSource>();

        // Assert

        assert!(actual.is_err());
    }
}
