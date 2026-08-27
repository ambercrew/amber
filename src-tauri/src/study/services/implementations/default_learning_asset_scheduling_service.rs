#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::event_manager::EventManager;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::entities::learning_asset_review_log::LearningAssetReviewLog;
use crate::study::events::element_due_changed_event::emit_element_due_changed;
use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::learning_asset_scheduling_service::{
    LearningAssetSchedulingError, LearningAssetSchedulingService,
};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::utils::day_boundary::start_of_today_utc;
use crate::study::value_objects::learning_asset_action::LearningAssetAction;

#[derive(ScopeInjectable)]
pub struct DefaultLearningAssetSchedulingService {
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    learning_asset_review_log_repository: Arc<dyn LearningAssetReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
    extract_repository: Arc<dyn ExtractRepository>,
    event_manager: Arc<dyn EventManager>,
}

#[async_trait]
impl LearningAssetSchedulingService for DefaultLearningAssetSchedulingService {
    async fn next(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError> {
        let existing = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?;
        let interval = self.compute_next_interval(element_id, &existing).await?;

        let now = Utc::now();
        let review = LearningAssetReview {
            element_id,
            due: due_from_interval(interval),
            interval_days: interval,
            last_reviewed: Some(now),
            finished_at: existing.and_then(|review| review.finished_at),
        };

        self.learning_asset_review_repository
            .upsert(&review)
            .await?;
        self.append_log(element_id, now, LearningAssetAction::Next)
            .await?;

        Ok(review)
    }

    async fn preview_next(
        &self,
        element_id: ElementId,
    ) -> Result<DateTime<Utc>, LearningAssetSchedulingError> {
        let existing = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?;
        let interval = self.compute_next_interval(element_id, &existing).await?;

        Ok(due_from_interval(interval))
    }

    async fn finish(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError> {
        let now = Utc::now();
        let existing = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?;

        let review = match existing {
            Some(review) => LearningAssetReview {
                finished_at: Some(now),
                ..review
            },
            None => LearningAssetReview {
                element_id,
                due: now,
                interval_days: 0.0,
                last_reviewed: None,
                finished_at: Some(now),
            },
        };

        self.learning_asset_review_repository
            .upsert(&review)
            .await?;
        self.append_log(element_id, now, LearningAssetAction::Finish)
            .await?;
        emit_element_due_changed(&self.event_manager).await;

        Ok(review)
    }

    async fn finish_many(
        &self,
        element_ids: Vec<ElementId>,
    ) -> Result<(), LearningAssetSchedulingError> {
        for element_id in element_ids {
            self.finish(element_id).await?;
        }
        Ok(())
    }

    async fn unfinish(
        &self,
        element_id: ElementId,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError> {
        let existing = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?
            .ok_or(LearningAssetSchedulingError::NeverReviewed)?;

        let review = LearningAssetReview {
            finished_at: None,
            due: start_of_today_utc(),
            ..existing
        };

        self.learning_asset_review_repository
            .upsert(&review)
            .await?;
        emit_element_due_changed(&self.event_manager).await;

        Ok(review)
    }

    async fn unfinish_many(
        &self,
        element_ids: Vec<ElementId>,
    ) -> Result<(), LearningAssetSchedulingError> {
        for element_id in element_ids {
            match self.unfinish(element_id).await {
                Ok(_) | Err(LearningAssetSchedulingError::NeverReviewed) => {}
                Err(err) => return Err(err),
            }
        }
        Ok(())
    }

    async fn set_due(
        &self,
        element_id: ElementId,
        due: DateTime<Utc>,
    ) -> Result<LearningAssetReview, LearningAssetSchedulingError> {
        if !matches!(
            element_id,
            ElementId::LearningAsset(_) | ElementId::Extract(_)
        ) {
            return Err(LearningAssetSchedulingError::NotSchedulable);
        }

        let existing = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?;

        let review = match existing {
            Some(review) => LearningAssetReview {
                due,
                finished_at: None,
                ..review
            },
            None => LearningAssetReview {
                element_id,
                due,
                interval_days: 0.0,
                last_reviewed: None,
                finished_at: None,
            },
        };

        self.learning_asset_review_repository
            .upsert(&review)
            .await?;
        emit_element_due_changed(&self.event_manager).await;

        Ok(review)
    }
}

impl DefaultLearningAssetSchedulingService {
    async fn compute_next_interval(
        &self,
        element_id: ElementId,
        existing: &Option<LearningAssetReview>,
    ) -> Result<f32, LearningAssetSchedulingError> {
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(element_id))
            .await?;

        Ok(match existing {
            Some(review) if review.interval_days > 0.0 => {
                let interval_multiplier = self.interval_multiplier_for(element_id).await?;
                review.interval_days * interval_multiplier
            }
            _ => profile.initial_interval_days,
        }
        .max(profile.min_interval_days))
    }

    async fn interval_multiplier_for(
        &self,
        element_id: ElementId,
    ) -> Result<f32, LearningAssetSchedulingError> {
        Ok(match element_id {
            ElementId::LearningAsset(id) => {
                self.learning_asset_repository
                    .get_by_id(id)
                    .await?
                    .interval_multiplier
            }
            ElementId::Extract(id) => {
                self.extract_repository
                    .get_by_id(id)
                    .await?
                    .interval_multiplier
            }
            _ => unreachable!(
                "learning_asset scheduling only applies to learning_assets and extracts"
            ),
        })
    }

    async fn append_log(
        &self,
        element_id: ElementId,
        reviewed_at: chrono::DateTime<Utc>,
        action: LearningAssetAction,
    ) -> Result<(), LearningAssetSchedulingError> {
        self.learning_asset_review_log_repository
            .create(&LearningAssetReviewLog {
                id: Uuid::new_v4(),
                element_id: Some(element_id.id()),
                reviewed_at,
                action,
            })
            .await?;
        Ok(())
    }
}

fn due_from_interval(interval_days: f32) -> DateTime<Utc> {
    start_of_today_utc() + Duration::seconds((interval_days as f64 * 86400.0).round() as i64)
}

#[cfg(test)]
mod tests {
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::{
            entities::learning_asset::LearningAsset,
            repositories::{
                extract_repository::ExtractRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::meta::Meta,
        },
        infrastructure::repositories::sqlite::{
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::repositories::study_profile_repository::StudyProfileRepository,
        study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
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
        injector
    }

    async fn create_test_learning_asset(
        scope: &injector::injector_scope::InjectorScope<'_>,
    ) -> ElementId {
        create_test_learning_asset_with_interval_multiplier(scope, 1.2).await
    }

    async fn create_test_learning_asset_with_interval_multiplier(
        scope: &injector::injector_scope::InjectorScope<'_>,
        interval_multiplier: f32,
    ) -> ElementId {
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let element_id = ElementId::LearningAsset(Uuid::new_v4());
        learning_asset_repo
            .create(
                LearningAsset {
                    interval_multiplier,
                    meta: Meta {
                        element_id,
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
                Vec::new(),
            )
            .await
            .unwrap();
        element_id
    }

    #[tokio::test]
    async fn next_first_pass_uses_profile_initial_interval() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;

        // Act

        let review = service.next(element_id).await.unwrap();

        // Assert

        assert_eq!(1.0, review.interval_days);
    }

    #[tokio::test]
    async fn next_second_pass_multiplies_interval_by_interval_multiplier() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        service.next(element_id).await.unwrap();

        // Act

        let review = service.next(element_id).await.unwrap();

        // Assert

        assert_eq!(1.2, review.interval_days);
    }

    #[tokio::test]
    async fn next_second_pass_uses_learning_assets_own_interval_multiplier_not_profiles() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset_with_interval_multiplier(&scope, 1.5).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        service.next(element_id).await.unwrap();

        // Act

        let review = service.next(element_id).await.unwrap();

        // Assert

        assert_eq!(1.5, review.interval_days);
    }

    #[tokio::test]
    async fn finish_preserves_due_and_interval() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        let before = service.next(element_id).await.unwrap();

        // Act

        let after = service.finish(element_id).await.unwrap();

        // Assert

        assert!(after.finished_at.is_some());
        assert_eq!(before.due, after.due);
        assert_eq!(before.interval_days, after.interval_days);
    }

    #[tokio::test]
    async fn unfinish_finished_element_clears_finished_at_and_resets_due_to_today() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        service.next(element_id).await.unwrap();
        service.finish(element_id).await.unwrap();

        // Act

        let after = service.unfinish(element_id).await.unwrap();

        // Assert

        assert!(after.finished_at.is_none());
        assert_eq!(start_of_today_utc(), after.due);
    }

    #[tokio::test]
    async fn unfinish_never_reviewed_element_returns_never_reviewed_error() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;

        // Act

        let result = service.unfinish(element_id).await;

        // Assert

        assert!(matches!(
            result,
            Err(LearningAssetSchedulingError::NeverReviewed)
        ));
    }

    #[tokio::test]
    async fn finish_many_multiple_elements_marks_all_finished() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let first_id = create_test_learning_asset(&scope).await;
        let second_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;

        // Act

        service
            .finish_many(vec![first_id, second_id])
            .await
            .unwrap();
        let review_repository = scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let first = review_repository
            .get_by_element_id(first_id.id())
            .await
            .unwrap()
            .unwrap();
        let second = review_repository
            .get_by_element_id(second_id.id())
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert!(first.finished_at.is_some());
        assert!(second.finished_at.is_some());
    }

    #[tokio::test]
    async fn unfinish_many_multiple_finished_elements_unfinishes_all() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let first_id = create_test_learning_asset(&scope).await;
        let second_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        service.finish(first_id).await.unwrap();
        service.finish(second_id).await.unwrap();

        // Act

        service
            .unfinish_many(vec![first_id, second_id])
            .await
            .unwrap();
        let review_repository = scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let first = review_repository
            .get_by_element_id(first_id.id())
            .await
            .unwrap()
            .unwrap();
        let second = review_repository
            .get_by_element_id(second_id.id())
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert!(first.finished_at.is_none());
        assert!(second.finished_at.is_none());
    }

    #[tokio::test]
    async fn unfinish_many_never_reviewed_element_skips_it_without_error() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let never_reviewed_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;

        // Act

        let result = service.unfinish_many(vec![never_reviewed_id]).await;

        // Assert

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn set_due_existing_review_updates_due_without_changing_finished_or_interval() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        let before = service.next(element_id).await.unwrap();
        let due = Utc::now() + Duration::days(10);

        // Act

        let after = service.set_due(element_id, due).await.unwrap();

        // Assert

        assert_eq!(due.timestamp(), after.due.timestamp());
        assert_eq!(before.interval_days, after.interval_days);
        assert_eq!(before.finished_at, after.finished_at);
        assert_eq!(
            before.last_reviewed.map(|t| t.timestamp()),
            after.last_reviewed.map(|t| t.timestamp())
        );
    }

    #[tokio::test]
    async fn set_due_finished_element_clears_finished_at() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        service.next(element_id).await.unwrap();
        service.finish(element_id).await.unwrap();
        let due = Utc::now() + Duration::days(3);

        // Act

        let after = service.set_due(element_id, due).await.unwrap();

        // Assert

        assert_eq!(due.timestamp(), after.due.timestamp());
        assert!(after.finished_at.is_none());
    }

    #[tokio::test]
    async fn set_due_never_reviewed_element_creates_a_review_with_the_given_due() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_id = create_test_learning_asset(&scope).await;
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        let due = Utc::now() + Duration::days(5);

        // Act

        let after = service.set_due(element_id, due).await.unwrap();

        // Assert

        assert_eq!(due.timestamp(), after.due.timestamp());
        assert_eq!(0.0, after.interval_days);
        assert!(after.last_reviewed.is_none());
        assert!(after.finished_at.is_none());
    }

    #[tokio::test]
    async fn set_due_folder_returns_not_schedulable() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn LearningAssetSchedulingService>().await;
        let folder_id = ElementId::Folder(Uuid::new_v4());

        // Act

        let result = service.set_due(folder_id, Utc::now()).await;

        // Assert

        assert!(matches!(
            result,
            Err(LearningAssetSchedulingError::NotSchedulable)
        ));
    }
}
