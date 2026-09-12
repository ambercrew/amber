#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::learning_asset_review_log::LearningAssetReviewLog;
use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;

#[derive(ScopeInjectable)]
pub struct SqliteLearningAssetReviewLogRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl LearningAssetReviewLogRepository for SqliteLearningAssetReviewLogRepository {
    async fn create(&self, log: &LearningAssetReviewLog) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let action = log.action.as_str();

        sqlx::query!(
            r#"INSERT INTO learning_asset_review_logs (id, element_id, reviewed_at, action)
            VALUES ($1, $2, datetime($3), $4)"#,
            log.id.hyphenated(),
            log.element_id.map(|id| id.hyphenated()),
            log.reviewed_at,
            action,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::learning_asset::{LearningAsset, LearningAssetContent},
            repositories::{
                learning_asset_repository::LearningAssetRepository, meta_repository::MetaRepository,
            },
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        study::value_objects::learning_asset_action::LearningAssetAction,
        test_utils::create_test_injector,
    };

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
            dyn LearningAssetReviewLogRepository,
            SqliteLearningAssetReviewLogRepository
        );
        injector
    }

    #[tokio::test]
    async fn create_valid_log_succeeds() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let repo = scope
            .resolve::<dyn LearningAssetReviewLogRepository>()
            .await;
        let element_id = Uuid::new_v4();
        learning_asset_repo
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: Meta {
                        element_id: ElementId::LearningAsset(element_id),
                        name: "test".into(),
                        parent: None,
                        position: FractionalIndex::default(),
                        priority: FractionalIndex::default(),
                        study_profile_id: None,
                        bibliographical_source_id: None,
                        derived_from: None,
                        created_at: Utc::now(),
                        modified_at: Utc::now(),
                    },
                    read_point: ReadPoint::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        let log = LearningAssetReviewLog {
            id: Uuid::new_v4(),
            element_id: Some(element_id),
            reviewed_at: Utc::now(),
            action: LearningAssetAction::Next,
        };

        // Act

        let result = repo.create(&log).await;

        // Assert

        assert!(result.is_ok());
    }
}
