use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::event_manager::EventManager;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::events::element_due_changed_event::emit_element_due_changed;
use crate::study::events::elements_suspended_event::{
    ELEMENTS_SUSPENDED_EVENT, ElementsSuspendedEventDto,
};
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::element_status_service::ElementStatusService;
use crate::study::services::learning_asset_scheduling_service::{
    LearningAssetSchedulingError, LearningAssetSchedulingService,
};
use crate::study::utils::day_boundary::start_of_today_utc;
use crate::study::value_objects::element_status::ElementStatus;

/// Keeps `meta.suspended` and `finished_at` mutually exclusive so each element has one status.
#[derive(ScopeInjectable)]
pub struct DefaultElementStatusService {
    meta_repository: Arc<dyn MetaRepository>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    learning_asset_scheduling_service: Arc<dyn LearningAssetSchedulingService>,
    event_manager: Arc<dyn EventManager>,
}

#[async_trait]
impl ElementStatusService for DefaultElementStatusService {
    async fn set_status_many(
        &self,
        ids: Vec<ElementId>,
        status: ElementStatus,
    ) -> Result<usize, LearningAssetSchedulingError> {
        let ids: Vec<ElementId> = ids
            .into_iter()
            .filter(|id| status.applies_to(*id))
            .collect();
        let live = self.meta_repository.filter_live(&ids).await?;

        // `finish()` unsuspends on its own, so only the other two statuses touch the flag here.
        if status != ElementStatus::Finished {
            let suspended = status == ElementStatus::Suspended;
            let changed = self
                .meta_repository
                .set_suspended_many(&live, suspended)
                .await?;
            if !changed.is_empty() {
                emit_element_due_changed(&self.event_manager).await;
                if suspended {
                    self.emit_elements_suspended(changed).await;
                }
            }
        }

        let reviewable: Vec<ElementId> = live
            .iter()
            .copied()
            .filter(|id| matches!(id, ElementId::LearningAsset(_) | ElementId::Extract(_)))
            .collect();
        self.set_finished(&reviewable, status).await?;

        Ok(live.len())
    }
}

impl DefaultElementStatusService {
    /// Finishes or unfinishes only on a change, so the review log gets no repeated finish entries.
    /// Suspending keeps the due date, so a later reactivation resumes the old schedule.
    async fn set_finished(
        &self,
        ids: &[ElementId],
        status: ElementStatus,
    ) -> Result<(), LearningAssetSchedulingError> {
        let uuids: Vec<Uuid> = ids.iter().map(|id| id.id()).collect();
        if status != ElementStatus::Finished {
            let due = (status == ElementStatus::Active).then(start_of_today_utc);
            let unfinished = self
                .learning_asset_review_repository
                .unfinish_many(&uuids, due)
                .await?;
            if !unfinished.is_empty() {
                emit_element_due_changed(&self.event_manager).await;
            }
            return Ok(());
        }

        let was_finished: HashSet<Uuid> = self
            .learning_asset_review_repository
            .finished_among(&uuids)
            .await?
            .into_iter()
            .collect();
        for &id in ids.iter().filter(|id| !was_finished.contains(&id.id())) {
            self.learning_asset_scheduling_service
                .finish(id, None)
                .await?;
        }
        Ok(())
    }

    async fn emit_elements_suspended(&self, element_ids: Vec<ElementId>) {
        let body = serde_json::to_value(ElementsSuspendedEventDto { element_ids })
            .expect("ElementsSuspendedEventDto always serializes");
        self.event_manager
            .push(ELEMENTS_SUSPENDED_EVENT, body)
            .await;
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::entities::learning_asset::LearningAsset;
    use crate::elements::repositories::extract_repository::ExtractRepository;
    use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
    use crate::elements::value_objects::learning_asset_content::LearningAssetContent;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::elements::value_objects::reading_position::ReadingPosition;
    use crate::infrastructure::repositories::sqlite::{
        sqlite_extract_repository::SqliteExtractRepository,
        sqlite_learning_asset_repository::SqliteLearningAssetRepository,
        sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository,
        sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
        sqlite_meta_repository::SqliteMetaRepository,
        sqlite_study_profile_repository::SqliteStudyProfileRepository,
    };
    use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
    use crate::study::repositories::study_profile_repository::StudyProfileRepository;
    use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
    use crate::study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService;
    use crate::study::services::profile_resolution_service::ProfileResolutionService;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
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
        injector
    }

    fn make_meta(element_id: ElementId) -> Meta {
        Meta {
            element_id,
            name: "test".into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            study_profile_id: None,
            bibliographical_source_id: None,
            derived_from: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    async fn create_learning_asset(
        scope: &injector::injector_scope::InjectorScope<'_>,
    ) -> ElementId {
        let id = ElementId::LearningAsset(Uuid::new_v4());
        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: make_meta(id),
                    read_point: ReadingPosition::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        id
    }

    async fn status_of(
        scope: &injector::injector_scope::InjectorScope<'_>,
        id: ElementId,
    ) -> ElementStatus {
        let suspended = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(id.id())
            .await
            .unwrap()
            .suspended;
        let finished = scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .get_by_element_id(id.id())
            .await
            .unwrap()
            .is_some_and(|review| review.finished_at.is_some());
        ElementStatus::from_flags(suspended, finished)
    }

    #[tokio::test]
    async fn set_status_many_each_status_leaves_element_in_only_that_status() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let service = scope.resolve::<dyn ElementStatusService>().await;
        let sequence = [
            ElementStatus::Finished,
            ElementStatus::Suspended,
            ElementStatus::Finished,
            ElementStatus::Active,
        ];

        // Act

        let mut actual = Vec::new();
        for status in sequence {
            service.set_status_many(vec![id], status).await.unwrap();
            let suspended = scope
                .resolve::<dyn MetaRepository>()
                .await
                .get_by_id(id.id())
                .await
                .unwrap()
                .suspended;
            actual.push((status_of(&scope, id).await, suspended));
        }

        // Assert

        assert_eq!(
            vec![
                (ElementStatus::Finished, false),
                (ElementStatus::Suspended, true),
                (ElementStatus::Finished, false),
                (ElementStatus::Active, false),
            ],
            actual
        );
    }

    #[tokio::test]
    async fn set_status_many_suspending_finished_asset_keeps_its_due_date() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let scheduled = scope
            .resolve::<dyn LearningAssetSchedulingService>()
            .await
            .next(id, None)
            .await
            .unwrap();
        let service = scope.resolve::<dyn ElementStatusService>().await;
        service
            .set_status_many(vec![id], ElementStatus::Finished)
            .await
            .unwrap();

        // Act

        service
            .set_status_many(vec![id], ElementStatus::Suspended)
            .await
            .unwrap();
        service
            .set_status_many(vec![id], ElementStatus::Active)
            .await
            .unwrap();

        // Assert

        let review = scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .get_by_element_id(id.id())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(scheduled.due, review.due);
        assert!(review.finished_at.is_none());
    }

    #[tokio::test]
    async fn set_status_many_finished_card_and_folder_skips_them() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let card = ElementId::Card(Uuid::new_v4());
        let folder = ElementId::Folder(Uuid::new_v4());
        meta_repository.create_meta(&make_meta(card)).await.unwrap();
        meta_repository
            .create_meta(&make_meta(folder))
            .await
            .unwrap();
        let service = scope.resolve::<dyn ElementStatusService>().await;

        // Act

        let suspended_count = service
            .set_status_many(vec![card], ElementStatus::Suspended)
            .await
            .unwrap();
        let finished_count = service
            .set_status_many(vec![card, folder], ElementStatus::Finished)
            .await
            .unwrap();

        // Assert

        assert_eq!((1, 0), (suspended_count, finished_count));
        assert!(
            meta_repository
                .get_by_id(card.id())
                .await
                .unwrap()
                .suspended
        );
        assert!(
            !meta_repository
                .get_by_id(folder.id())
                .await
                .unwrap()
                .suspended
        );
    }

    #[tokio::test]
    async fn set_status_many_missing_ids_skips_them_without_error() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = create_learning_asset(&scope).await;
        let missing = ElementId::LearningAsset(Uuid::new_v4());
        let service = scope.resolve::<dyn ElementStatusService>().await;

        // Act

        let applied = service
            .set_status_many(vec![id, missing], ElementStatus::Finished)
            .await
            .unwrap();

        // Assert

        assert_eq!(1, applied);
        assert_eq!(ElementStatus::Finished, status_of(&scope, id).await);
    }
}
