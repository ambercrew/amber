use serde::{Deserialize, Serialize};

/// What happens to a card that reaches its profile's leech threshold; it's tagged `leech` either way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LeechAction {
    #[default]
    TagOnly,
    Suspend,
}

impl LeechAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            LeechAction::TagOnly => "tag_only",
            LeechAction::Suspend => "suspend",
        }
    }
}

impl From<&str> for LeechAction {
    fn from(value: &str) -> Self {
        match value {
            "suspend" => LeechAction::Suspend,
            _ => LeechAction::TagOnly,
        }
    }
}
