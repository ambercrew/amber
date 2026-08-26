use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::services::card_grading_service::{CardGradingService, GradeCardError};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::value_objects::rating::Rating;

#[derive(ScopeInjectable)]
pub struct DefaultCardGradingService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
}

#[async_trait]
impl CardGradingService for DefaultCardGradingService {
    async fn register_review(
        &self,
        review: CardReview,
        rating: Rating,
        duration_ms: Option<u32>,
    ) -> Result<CardReview, GradeCardError> {
        self.card_review_repository.upsert(&review).await?;
        self.card_review_log_repository
            .create(&CardReviewLog {
                id: Uuid::new_v4(),
                card_id: Some(review.card_id),
                reviewed_at: Utc::now(),
                rating,
                duration_ms,
            })
            .await?;

        Ok(review)
    }

    async fn scheduling_inputs(
        &self,
        card_id: Uuid,
    ) -> Result<(CardReview, StudyProfile), GradeCardError> {
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(ElementId::Card(card_id)))
            .await?;
        let review = self
            .card_review_repository
            .get_by_card_id(card_id)
            .await?
            .unwrap_or_else(|| CardReview::new_for_profile(card_id, &profile));

        Ok((review, profile))
    }

    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError> {
        for card_id in card_ids {
            let profile = self
                .profile_resolution_service
                .resolve_profile(Some(ElementId::Card(card_id)))
                .await?;
            let review = CardReview::new_for_profile(card_id, &profile);
            self.card_review_repository.upsert(&review).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Duration;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::{
            entities::card::Card,
            repositories::{card_repository::CardRepository, meta_repository::MetaRepository},
            value_objects::meta::Meta,
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_log_repository::SqliteCardReviewLogRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::repositories::study_profile_repository::StudyProfileRepository,
        study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
        study::value_objects::card_state::CardState,
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn CardReviewRepository,
            SqliteCardReviewRepository
        );
        register_scope!(
            injector,
            dyn CardReviewLogRepository,
            SqliteCardReviewLogRepository
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
        register_scope!(injector, dyn CardGradingService, DefaultCardGradingService);
        injector
    }

    async fn create_test_card(scope: &injector::injector_scope::InjectorScope<'_>) -> Uuid {
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: Meta {
                    element_id: ElementId::Card(card_id),
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
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        card_id
    }

    fn scheduled_review(card_id: Uuid) -> CardReview {
        CardReview {
            card_id,
            due: Utc::now() + Duration::minutes(10),
            stability: 2.31,
            difficulty: 5.12,
            reps: 1,
            lapses: 0,
            state: CardState::Learning,
            last_reviewed: Some(Utc::now()),
            scheduled_days: 0,
            learning_steps: 1,
        }
    }

    #[tokio::test]
    async fn register_review_scheduled_review_is_stored_as_given() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        let review = scheduled_review(card_id);

        // Act

        service
            .register_review(review.clone(), Rating::Good, Some(1000))
            .await
            .unwrap();
        let actual = scope
            .resolve::<dyn CardReviewRepository>()
            .await
            .get_by_card_id(card_id)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(review.state, actual.state);
        assert_eq!(review.reps, actual.reps);
        assert_eq!(review.learning_steps, actual.learning_steps);
        assert_eq!(review.stability, actual.stability);
    }

    #[tokio::test]
    async fn scheduling_inputs_card_without_a_stored_review_returns_new_card_defaults() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let (review, profile) = service.scheduling_inputs(card_id).await.unwrap();

        // Assert

        assert_eq!(CardState::New, review.state);
        assert_eq!(0, review.reps);
        assert_eq!(0, review.learning_steps);
        assert_eq!(0.9, profile.desired_retention);
    }

    #[tokio::test]
    async fn scheduling_inputs_card_with_a_stored_review_returns_the_stored_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        service
            .register_review(scheduled_review(card_id), Rating::Good, None)
            .await
            .unwrap();

        // Act

        let (review, _) = service.scheduling_inputs(card_id).await.unwrap();

        // Assert

        assert_eq!(CardState::Learning, review.state);
        assert_eq!(1, review.reps);
        assert_eq!(1, review.learning_steps);
    }

    #[tokio::test]
    async fn reset_previously_reviewed_card_reverts_to_new_card_defaults() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        service
            .register_review(scheduled_review(card_id), Rating::Good, None)
            .await
            .unwrap();

        // Act

        service.reset(vec![card_id]).await.unwrap();
        let actual = scope
            .resolve::<dyn CardReviewRepository>()
            .await
            .get_by_card_id(card_id)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(CardState::New, actual.state);
        assert_eq!(0.0, actual.stability);
        assert_eq!(0.0, actual.difficulty);
        assert_eq!(0, actual.reps);
        assert_eq!(0, actual.lapses);
        assert_eq!(0, actual.learning_steps);
        assert!(actual.last_reviewed.is_none());
    }
}
