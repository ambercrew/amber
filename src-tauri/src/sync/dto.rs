use serde::Serialize;

use crate::sync::value_objects::sync_outcome::SyncOutcome;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponseDto {
    /// The first primary key value of each row the sync changed (an element's id for its rows), or
    /// `None` when too many changed to list.
    pub changed_keys: Option<Vec<String>>,
}

impl From<SyncOutcome> for SyncResponseDto {
    fn from(outcome: SyncOutcome) -> Self {
        let changed_keys = outcome.changed_row_ids.map(|row_ids| {
            let mut keys: Vec<String> = row_ids.iter().filter_map(|id| first_key(id)).collect();
            keys.sort_unstable();
            keys.dedup();
            keys
        });
        Self { changed_keys }
    }
}

/// A `row_id` is a JSON array of the row's primary key values.
fn first_key(row_id: &str) -> Option<String> {
    let values: Vec<serde_json::Value> = serde_json::from_str(row_id).ok()?;
    match values.into_iter().next()? {
        serde_json::Value::String(key) => Some(key),
        other => Some(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn from_composite_and_single_keys_returns_distinct_first_keys() {
        // Arrange

        let outcome = SyncOutcome {
            changed_row_ids: Some(HashSet::from([
                r#"["a"]"#.to_string(),
                r#"["a","tag"]"#.to_string(),
                r#"[7]"#.to_string(),
            ])),
        };

        // Act

        let actual = SyncResponseDto::from(outcome);

        // Assert

        assert_eq!(
            Some(vec!["7".to_string(), "a".to_string()]),
            actual.changed_keys
        );
    }

    #[test]
    fn from_too_many_rows_returns_none() {
        // Arrange

        let outcome = SyncOutcome {
            changed_row_ids: None,
        };

        // Act

        let actual = SyncResponseDto::from(outcome);

        // Assert

        assert_eq!(None, actual.changed_keys);
    }
}
