use serde::{Deserialize, Serialize};

use crate::elements::value_objects::element_id::ElementId;

/// Whether an element takes part in the review queue. Folders have no status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ElementStatus {
    Active,
    /// Out of the queue until set back to active (`meta.suspended`).
    Suspended,
    /// Done reading; learning assets and extracts only (`learning_asset_reviews.finished_at`).
    Finished,
}

impl ElementStatus {
    /// Finished wins over suspended: finishing a suspended element (e.g. through the AI) is the newer intent.
    pub fn from_flags(suspended: bool, finished: bool) -> Self {
        match (suspended, finished) {
            (_, true) => ElementStatus::Finished,
            (true, false) => ElementStatus::Suspended,
            (false, false) => ElementStatus::Active,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ElementStatus::Active => "active",
            ElementStatus::Suspended => "suspended",
            ElementStatus::Finished => "finished",
        }
    }

    pub fn applies_to(&self, element_id: ElementId) -> bool {
        match element_id {
            ElementId::Folder(_) => false,
            ElementId::Card(_) => *self != ElementStatus::Finished,
            ElementId::LearningAsset(_) | ElementId::Extract(_) => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    fn from_flags_suspended_and_finished_returns_finished() {
        // Arrange

        let (suspended, finished) = (true, true);

        // Act

        let actual = ElementStatus::from_flags(suspended, finished);

        // Assert

        assert_eq!(ElementStatus::Finished, actual);
    }

    #[test]
    fn applies_to_finished_card_returns_false() {
        // Arrange

        let card = ElementId::Card(Uuid::new_v4());

        // Act

        let actual = ElementStatus::Finished.applies_to(card);

        // Assert

        assert!(!actual);
    }
}
