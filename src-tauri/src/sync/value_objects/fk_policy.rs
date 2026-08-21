use crate::sync::errors::SyncError;

/// What to do with a synced row whose foreign key column references a row
/// that does not exist locally, once a full sync pass confirms the reference
/// really is dangling (as opposed to its target simply not having arrived
/// yet on an earlier page).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FkPolicy {
    SetNull,
    SetDefault(String),
    DiscardRow,
}

impl FkPolicy {
    /// Stable string stored in `sync_fk_policies.policy`.
    pub fn kind(&self) -> &'static str {
        match self {
            FkPolicy::SetNull => "set_null",
            FkPolicy::SetDefault(_) => "set_default",
            FkPolicy::DiscardRow => "discard_row",
        }
    }

    pub fn default_value(&self) -> Option<&str> {
        match self {
            FkPolicy::SetDefault(value) => Some(value.as_str()),
            _ => None,
        }
    }

    /// Reconstructs a policy from its persisted `(kind, default_value)` pair
    /// (see `kind` / `default_value`, and `sync_fk_policies`).
    pub fn from_parts(kind: &str, default_value: Option<String>) -> Result<Self, SyncError> {
        match kind {
            "set_null" => Ok(FkPolicy::SetNull),
            "set_default" => default_value.map(FkPolicy::SetDefault).ok_or_else(|| {
                SyncError::InvalidFkPolicyValue(
                    "'set_default' policy requires a default_value".to_string(),
                )
            }),
            "discard_row" => Ok(FkPolicy::DiscardRow),
            other => Err(SyncError::InvalidFkPolicyValue(other.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_set_null_returns_set_null_string() {
        // Arrange

        let policy = FkPolicy::SetNull;

        // Act

        let actual = policy.kind();

        // Assert

        assert_eq!("set_null", actual);
    }

    #[test]
    fn kind_set_default_returns_set_default_string() {
        // Arrange

        let policy = FkPolicy::SetDefault("0".to_string());

        // Act

        let actual = policy.kind();

        // Assert

        assert_eq!("set_default", actual);
    }

    #[test]
    fn kind_discard_row_returns_discard_row_string() {
        // Arrange

        let policy = FkPolicy::DiscardRow;

        // Act

        let actual = policy.kind();

        // Assert

        assert_eq!("discard_row", actual);
    }

    #[test]
    fn from_parts_set_null_returns_set_null_variant() {
        // Arrange & Act

        let actual = FkPolicy::from_parts("set_null", None).unwrap();

        // Assert

        assert_eq!(FkPolicy::SetNull, actual);
    }

    #[test]
    fn from_parts_set_default_with_value_returns_set_default_variant() {
        // Arrange & Act

        let actual = FkPolicy::from_parts("set_default", Some("0".to_string())).unwrap();

        // Assert

        assert_eq!(FkPolicy::SetDefault("0".to_string()), actual);
    }

    #[test]
    fn from_parts_set_default_without_value_returns_error() {
        // Arrange & Act

        let actual = FkPolicy::from_parts("set_default", None);

        // Assert

        assert!(actual.is_err());
    }

    #[test]
    fn from_parts_discard_row_returns_discard_row_variant() {
        // Arrange & Act

        let actual = FkPolicy::from_parts("discard_row", None).unwrap();

        // Assert

        assert_eq!(FkPolicy::DiscardRow, actual);
    }

    #[test]
    fn from_parts_unknown_kind_returns_error() {
        // Arrange & Act

        let actual = FkPolicy::from_parts("bogus", None);

        // Assert

        assert!(actual.is_err());
    }
}
