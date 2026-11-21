use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingError;

#[async_trait]
pub trait LeechService: Send + Sync {
    /// Whether the card is tagged `leech`.
    async fn is_leech(&self, card_id: Uuid) -> Result<bool, RepositoryError>;

    /// Clears a rewritten card's leech flag: removes the `leech` tag and, if it's suspended, resumes reviewing it.
    /// Leaves its review history alone. Does nothing for a card that isn't a leech.
    async fn clear_leech(&self, card_id: Uuid) -> Result<(), LearningAssetSchedulingError>;
}
