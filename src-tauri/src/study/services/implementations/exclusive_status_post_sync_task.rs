use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::elements::repositories::meta_repository::MetaRepository;
use crate::sync::post_sync_task::{PostSyncTask, PostSyncTaskError};

/// Restores "suspended and finished are exclusive" after a sync merges both flags in from different devices.
/// Finished wins (`ElementStatus::from_flags`), decided from the synced flags alone so every device agrees.
#[derive(ScopeInjectable)]
pub struct ExclusiveStatusPostSyncTask {
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl PostSyncTask for ExclusiveStatusPostSyncTask {
    fn name(&self) -> &'static str {
        "exclusive element status"
    }

    async fn run(&self) -> Result<(), PostSyncTaskError> {
        let repaired = self.meta_repository.unsuspend_finished().await?;
        if repaired > 0 {
            log::info!("Post-sync repair: unsuspending {repaired} finished element(s)");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::entities::learning_asset::LearningAsset;
    use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::learning_asset_content::LearningAssetContent;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::elements::value_objects::reading_position::ReadingPosition;
    use crate::infrastructure::repositories::sqlite::{
        sqlite_learning_asset_repository::SqliteLearningAssetRepository,
        sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
        sqlite_meta_repository::SqliteMetaRepository,
    };
    use crate::study::entities::learning_asset_review::LearningAssetReview;
    use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(injector, ExclusiveStatusPostSyncTask);
        injector
    }

    #[tokio::test]
    async fn run_suspended_and_finished_element_unsuspends_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = ElementId::LearningAsset(Uuid::new_v4());
        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: Meta {
                        element_id: id,
                        name: "test".into(),
                        name_source: NameSource::Manual,
                        suspended: true,
                        parent: None,
                        position: FractionalIndex::default(),
                        priority: FractionalIndex::default(),
                        study_profile_id: None,
                        bibliographical_source_id: None,
                        derived_from: None,
                        created_at: Utc::now(),
                        modified_at: Utc::now(),
                    },
                    read_point: ReadingPosition::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .upsert(&LearningAssetReview {
                element_id: id,
                due: Utc::now(),
                interval_days: 1.0,
                last_reviewed: None,
                finished_at: Some(Utc::now()),
            })
            .await
            .unwrap();
        let task = scope.resolve::<ExclusiveStatusPostSyncTask>().await;

        // Act

        task.run().await.unwrap();

        // Assert

        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(id.id())
            .await
            .unwrap();
        assert!(!meta.suspended);
    }
}
