use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::elements::repositories::meta_repository::MetaRepository;
use crate::sync::post_sync_task::{PostSyncTask, PostSyncTaskError};

const MAX_LOGGED_IDS: usize = 5;

/// Reports elements left with no content row, which can't be opened. Only logs: the content
/// may be gone, and deciding what to do with them isn't something every device should repeat.
#[derive(ScopeInjectable)]
pub struct MissingContentPostSyncTask {
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl PostSyncTask for MissingContentPostSyncTask {
    fn name(&self) -> &'static str {
        "missing element content"
    }

    async fn run(&self) -> Result<(), PostSyncTaskError> {
        let ids = self.meta_repository.find_ids_without_content().await?;
        if !ids.is_empty() {
            log::warn!(
                "{} element(s) have no content row, e.g. {:?}",
                ids.len(),
                &ids[..ids.len().min(MAX_LOGGED_IDS)]
            );
        }
        Ok(())
    }
}
