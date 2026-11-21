use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::services::element_status_service::ElementStatusService;
use crate::study::services::implementations::default_card_grading_service::LEECH_TAG;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingError;
use crate::study::services::leech_service::LeechService;
use crate::study::value_objects::element_status::ElementStatus;

#[derive(ScopeInjectable)]
pub struct DefaultLeechService {
    meta_repository: Arc<dyn MetaRepository>,
    element_status_service: Arc<dyn ElementStatusService>,
}

#[async_trait]
impl LeechService for DefaultLeechService {
    async fn is_leech(&self, card_id: Uuid) -> Result<bool, RepositoryError> {
        let tags = self
            .meta_repository
            .get_tags(ElementId::Card(card_id))
            .await?;
        Ok(tags.iter().any(|tag| tag.name == LEECH_TAG))
    }

    async fn clear_leech(&self, card_id: Uuid) -> Result<(), LearningAssetSchedulingError> {
        if !self.is_leech(card_id).await? {
            return Ok(());
        }
        let card = ElementId::Card(card_id);
        self.meta_repository
            .remove_tags(card, vec![LEECH_TAG.to_string()])
            .await?;
        // A suspended leech was most likely suspended for being one.
        if self.meta_repository.get_by_id(card_id).await?.suspended {
            self.element_status_service
                .set_status_many(vec![card], ElementStatus::Active)
                .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::elements::entities::card::Card;
    use crate::elements::repositories::card_repository::CardRepository;
    use crate::elements::repositories::extract_repository::ExtractRepository;
    use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::infrastructure::repositories::sqlite::{
        sqlite_card_repository::SqliteCardRepository,
        sqlite_extract_repository::SqliteExtractRepository,
        sqlite_learning_asset_repository::SqliteLearningAssetRepository,
        sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository,
        sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
        sqlite_meta_repository::SqliteMetaRepository,
        sqlite_study_profile_repository::SqliteStudyProfileRepository,
    };
    use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
    use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
    use crate::study::repositories::study_profile_repository::StudyProfileRepository;
    use crate::study::services::implementations::default_element_status_service::DefaultElementStatusService;
    use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
    use crate::study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService;
    use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
    use crate::study::services::profile_resolution_service::ProfileResolutionService;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(
            injector,
            dyn LearningAssetReviewLogRepository,
            SqliteLearningAssetReviewLogRepository
        );
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn ProfileResolutionService,
            DefaultProfileResolutionService
        );
        register_scope!(
            injector,
            dyn LearningAssetSchedulingService,
            DefaultLearningAssetSchedulingService
        );
        register_scope!(
            injector,
            dyn ElementStatusService,
            DefaultElementStatusService
        );
        register_scope!(injector, dyn LeechService, DefaultLeechService);
        injector
    }

    async fn create_card(
        scope: &injector::injector_scope::InjectorScope<'_>,
        tags: &[&str],
        suspended: bool,
    ) -> Uuid {
        let card_id = Uuid::new_v4();
        scope
            .resolve::<dyn CardRepository>()
            .await
            .create(Card {
                meta: Meta {
                    element_id: ElementId::Card(card_id),
                    name: "test".into(),
                    name_source: NameSource::Manual,
                    suspended,
                    parent: None,
                    position: FractionalIndex::default(),
                    priority: FractionalIndex::default(),
                    study_profile_id: None,
                    bibliographical_source_id: None,
                    derived_from: None,
                    created_at: Utc::now(),
                    modified_at: Utc::now(),
                },
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        meta_repository
            .add_tags(
                ElementId::Card(card_id),
                tags.iter().map(|tag| tag.to_string()).collect(),
            )
            .await
            .unwrap();
        card_id
    }

    async fn tag_names(
        scope: &injector::injector_scope::InjectorScope<'_>,
        card_id: Uuid,
    ) -> Vec<String> {
        scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_tags(ElementId::Card(card_id))
            .await
            .unwrap()
            .into_iter()
            .map(|tag| tag.name)
            .collect()
    }

    #[tokio::test]
    async fn clear_leech_suspended_leech_removes_tag_and_resumes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_card(&scope, &[LEECH_TAG, "biology"], true).await;
        let service = scope.resolve::<dyn LeechService>().await;

        // Act

        service.clear_leech(card_id).await.unwrap();

        // Assert

        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(card_id)
            .await
            .unwrap();
        assert!(!meta.suspended);
        assert_eq!(
            vec!["biology".to_string()],
            tag_names(&scope, card_id).await
        );
    }

    #[tokio::test]
    async fn clear_leech_suspended_card_without_leech_tag_leaves_it_suspended() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_card(&scope, &["biology"], true).await;
        let service = scope.resolve::<dyn LeechService>().await;

        // Act

        service.clear_leech(card_id).await.unwrap();

        // Assert

        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(card_id)
            .await
            .unwrap();
        assert!(meta.suspended);
    }
}
