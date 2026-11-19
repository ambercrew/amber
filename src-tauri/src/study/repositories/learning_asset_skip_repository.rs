use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;

#[async_trait]
pub trait LearningAssetSkipRepository: Send + Sync {
    /// Records that the element was skipped at `skipped_at`, replacing any earlier skip.
    async fn record_skip(
        &self,
        element_id: Uuid,
        skipped_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;

    /// Elements skipped at or after `since`, earliest skip first.
    async fn get_skipped_since(&self, since: DateTime<Utc>) -> Result<Vec<Uuid>, RepositoryError>;
}
