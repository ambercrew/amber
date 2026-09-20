use serde::{Deserialize, Serialize};

/// Where a newly created element lands in the priority queue, relative to the
/// element it was derived from.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Placement {
    #[default]
    AboveParent,

    BelowParent,

    #[serde(rename_all = "camelCase")]
    OffsetFromParent {
        offset_percentile: f64,
    },

    #[serde(rename_all = "camelCase")]
    FixedPercentile {
        percentile: f64,
    },
}

/// A [`Placement`] plus an optional cap on how far forward it may reach: with a
/// ceiling of 20, a parent at 3% still yields 20%.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityInheritancePolicy {
    #[serde(default)]
    pub placement: Placement,

    #[serde(default)]
    pub ceiling_percentile: Option<f64>,
}

impl Placement {
    pub fn kind(&self) -> &'static str {
        match self {
            Placement::AboveParent => "above_parent",
            Placement::BelowParent => "below_parent",
            Placement::OffsetFromParent { .. } => "offset_from_parent",
            Placement::FixedPercentile { .. } => "fixed_percentile",
        }
    }

    pub fn percentile(&self) -> Option<f64> {
        match self {
            Placement::AboveParent | Placement::BelowParent => None,
            Placement::OffsetFromParent { offset_percentile } => Some(*offset_percentile),
            Placement::FixedPercentile { percentile } => Some(*percentile),
        }
    }

    /// Anything unreadable — unknown kind, or a kind whose percentile is
    /// missing — falls back to the default.
    pub fn from_columns(kind: Option<&str>, percentile: Option<f64>) -> Self {
        match (kind, percentile) {
            (Some("above_parent"), _) => Placement::AboveParent,
            (Some("below_parent"), _) => Placement::BelowParent,
            (Some("offset_from_parent"), Some(offset_percentile)) => {
                Placement::OffsetFromParent { offset_percentile }
            }
            (Some("fixed_percentile"), Some(percentile)) => {
                Placement::FixedPercentile { percentile }
            }
            (Some(kind @ ("offset_from_parent" | "fixed_percentile")), None) => {
                log::warn!(
                    "Priority inheritance placement {kind:?} has no percentile, using default"
                );
                Placement::default()
            }
            (Some(unknown), _) => {
                log::warn!("Unreadable priority inheritance placement {unknown:?}, using default");
                Placement::default()
            }
            (None, _) => Placement::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_tagged_placement_returns_variant_with_field() {
        // Arrange

        let json = r#"{"placement":{"type":"offsetFromParent","offsetPercentile":15.0}}"#;

        // Act

        let actual: PriorityInheritancePolicy = serde_json::from_str(json).unwrap();

        // Assert

        assert_eq!(
            PriorityInheritancePolicy {
                placement: Placement::OffsetFromParent {
                    offset_percentile: 15.0
                },
                ceiling_percentile: None,
            },
            actual
        );
    }

    #[test]
    fn deserialize_with_ceiling_returns_policy_with_ceiling() {
        // Arrange

        let json = r#"{"placement":{"type":"belowParent"},"ceilingPercentile":20.0}"#;

        // Act

        let actual: PriorityInheritancePolicy = serde_json::from_str(json).unwrap();

        // Assert

        assert_eq!(
            PriorityInheritancePolicy {
                placement: Placement::BelowParent,
                ceiling_percentile: Some(20.0),
            },
            actual
        );
    }

    #[test]
    fn deserialize_empty_object_returns_default() {
        // Arrange

        let json = "{}";

        // Act

        let actual: PriorityInheritancePolicy = serde_json::from_str(json).unwrap();

        // Assert

        assert_eq!(PriorityInheritancePolicy::default(), actual);
    }

    #[test]
    fn serialize_uncapped_policy_returns_tagged_placement_and_null_ceiling() {
        // Arrange

        let policy = PriorityInheritancePolicy {
            placement: Placement::BelowParent,
            ceiling_percentile: None,
        };

        // Act

        let actual = serde_json::to_string(&policy).unwrap();

        // Assert

        assert_eq!(
            r#"{"placement":{"type":"belowParent"},"ceilingPercentile":null}"#,
            actual
        );
    }

    #[test]
    fn default_returns_uncapped_above_parent() {
        // Arrange & Act

        let actual = PriorityInheritancePolicy::default();

        // Assert

        assert_eq!(Placement::AboveParent, actual.placement);
        assert_eq!(None, actual.ceiling_percentile);
    }

    #[test]
    fn kind_and_percentile_on_offset_from_parent_returns_both_columns() {
        // Arrange

        let placement = Placement::OffsetFromParent {
            offset_percentile: 15.0,
        };

        // Act

        let actual = (placement.kind(), placement.percentile());

        // Assert

        assert_eq!(("offset_from_parent", Some(15.0)), actual);
    }

    #[test]
    fn percentile_on_above_parent_returns_none() {
        // Arrange & Act

        let actual = Placement::AboveParent.percentile();

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn from_columns_on_fixed_percentile_returns_variant_with_percentile() {
        // Arrange & Act

        let actual = Placement::from_columns(Some("fixed_percentile"), Some(50.0));

        // Assert

        assert_eq!(Placement::FixedPercentile { percentile: 50.0 }, actual);
    }

    #[test]
    fn from_columns_on_missing_kind_returns_default() {
        // Arrange & Act

        let actual = Placement::from_columns(None, None);

        // Assert

        assert_eq!(Placement::default(), actual);
    }

    #[test]
    fn from_columns_on_unknown_kind_returns_default() {
        // Arrange & Act

        let actual = Placement::from_columns(Some("sideways_from_parent"), Some(3.0));

        // Assert

        assert_eq!(Placement::default(), actual);
    }

    #[test]
    fn from_columns_on_percentile_kind_without_percentile_returns_default() {
        // Arrange & Act

        let actual = Placement::from_columns(Some("offset_from_parent"), None);

        // Assert

        assert_eq!(Placement::default(), actual);
    }
}
