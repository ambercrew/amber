use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::event_manager::EventManager;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::events::card_leeched_event::{CARD_LEECHED_EVENT, CardLeechedEventDto};
use crate::study::events::element_due_changed_event::emit_element_due_changed;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::services::card_grading_service::{
    CardGradingService, GradeCardError, RegisteredReview,
};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::utils::day_boundary::start_of_due_day;
use crate::study::value_objects::leech_action::LeechAction;
use crate::study::value_objects::rating::Rating;

#[derive(ScopeInjectable)]
pub struct DefaultCardGradingService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    meta_repository: Arc<dyn MetaRepository>,
    event_manager: Arc<dyn EventManager>,
    image_occlusion_repository: Arc<dyn ImageOcclusionRepository>,
}

/// The tag a card gets on becoming a leech, which the Browser can search for.
pub const LEECH_TAG: &str = "leech";

#[async_trait]
impl CardGradingService for DefaultCardGradingService {
    async fn register_review(
        &self,
        review: CardReview,
        rating: Rating,
        duration_ms: Option<u32>,
    ) -> Result<RegisteredReview, GradeCardError> {
        let previous_lapses = self
            .card_review_repository
            .get_by_card_id(review.card_id)
            .await?
            .map_or(0, |previous| previous.lapses);
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
        self.flag_if_leech(review, previous_lapses).await
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

    async fn reset_review(&self, card_id: Uuid) -> Result<CardReview, GradeCardError> {
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(ElementId::Card(card_id)))
            .await?;
        Ok(CardReview::new_for_profile(card_id, &profile))
    }

    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError> {
        for card_id in card_ids {
            let review = self.reset_review(card_id).await?;
            self.card_review_repository.upsert(&review).await?;
            self.card_review_repository.mark_reset(card_id).await?;
        }
        emit_element_due_changed(&self.event_manager).await;
        Ok(())
    }

    async fn set_due(
        &self,
        card_id: Uuid,
        due: DateTime<Utc>,
    ) -> Result<CardReview, GradeCardError> {
        let (mut review, _) = self.scheduling_inputs(card_id).await?;
        // Day-scheduled cards are due from the start of their day, as the scheduler puts them.
        review.due = if review.scheduled_days >= 1 {
            start_of_due_day(due)
        } else {
            due
        };
        self.card_review_repository.upsert(&review).await?;
        emit_element_due_changed(&self.event_manager).await;
        Ok(review)
    }
}

impl DefaultCardGradingService {
    /// Tags the card a leech, and suspends it if its profile says so, when this review's lapse makes it one.
    async fn flag_if_leech(
        &self,
        review: CardReview,
        previous_lapses: u32,
    ) -> Result<RegisteredReview, GradeCardError> {
        let not_leeched = |review| RegisteredReview {
            review,
            leeched: false,
            suspended: false,
        };
        // Most grades don't lapse, and resolving the profile walks the card's ancestors.
        if review.lapses <= previous_lapses {
            return Ok(not_leeched(review));
        }
        let card_id = ElementId::Card(review.card_id);
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(card_id))
            .await?;
        if !is_leech_lapse(previous_lapses, review.lapses, profile.leech_threshold) {
            return Ok(not_leeched(review));
        }

        self.meta_repository
            .add_tags(card_id, vec![LEECH_TAG.to_string()])
            .await?;
        let suspended = profile.leech_action == LeechAction::Suspend
            && self.meta_repository.set_suspended(card_id, true).await?;
        // No due-changed, suspended or card-changed events: the session grading the card moves on
        // itself, and reacting to them too would advance it again or reload the card over the next one.
        let body = serde_json::to_value(CardLeechedEventDto {
            card_id: review.card_id,
            lapses: review.lapses,
            suspended,
            rewritable: !self
                .image_occlusion_repository
                .is_card_linked(review.card_id)
                .await?,
        })
        .expect("CardLeechedEventDto always serializes");
        self.event_manager.push(CARD_LEECHED_EVENT, body).await;
        Ok(RegisteredReview {
            review,
            leeched: true,
            suspended,
        })
    }
}

/// Whether going from `previous` to `current` lapses reaches `threshold`, or every half of it past
/// that, as Anki flags leeches; a threshold of 0 never does.
fn is_leech_lapse(previous: u32, current: u32, threshold: u32) -> bool {
    if threshold == 0 || current <= previous || current < threshold {
        return false;
    }
    (current - threshold).is_multiple_of((threshold / 2).max(1))
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
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
            sqlite_image_occlusion_repository::SqliteImageOcclusionRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::entities::study_profile::StudyProfile,
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
        register_scope!(
            injector,
            dyn ImageOcclusionRepository,
            SqliteImageOcclusionRepository
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

    #[tokio::test]
    async fn set_due_day_scheduled_card_moves_it_to_the_start_of_that_day() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        let review = CardReview {
            state: CardState::Review,
            scheduled_days: 4,
            learning_steps: 0,
            ..scheduled_review(card_id)
        };
        service
            .register_review(review, Rating::Good, None)
            .await
            .unwrap();
        let due = Utc::now() + Duration::days(7);

        // Act

        let actual = service.set_due(card_id, due).await.unwrap();

        // Assert

        assert_eq!(start_of_due_day(due), actual.due);
    }

    #[tokio::test]
    async fn set_due_reviewed_card_updates_due_without_changing_fsrs_fields() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        let review = scheduled_review(card_id);
        service
            .register_review(review.clone(), Rating::Good, None)
            .await
            .unwrap();
        let due = Utc::now() + Duration::days(7);

        // Act

        let actual = service.set_due(card_id, due).await.unwrap();

        // Assert

        assert_eq!(due.timestamp(), actual.due.timestamp());
        assert_eq!(review.reps, actual.reps);
        assert_eq!(review.state, actual.state);
        assert_eq!(review.stability, actual.stability);
        assert_eq!(review.difficulty, actual.difficulty);
    }

    #[tokio::test]
    async fn set_due_card_without_a_stored_review_creates_a_review_with_the_given_due() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        let due = Utc::now() + Duration::days(3);

        // Act

        let actual = service.set_due(card_id, due).await.unwrap();
        let stored = scope
            .resolve::<dyn CardReviewRepository>()
            .await
            .get_by_card_id(card_id)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(due.timestamp(), actual.due.timestamp());
        assert_eq!(due.timestamp(), stored.due.timestamp());
        assert_eq!(CardState::New, stored.state);
    }

    /// Gives the default profile `threshold` and `action`, and the card `lapses` lapses already.
    async fn arrange_leech(
        scope: &injector::injector_scope::InjectorScope<'_>,
        card_id: Uuid,
        lapses: u32,
        threshold: u32,
        action: LeechAction,
    ) {
        let profile = scope
            .resolve::<dyn ProfileResolutionService>()
            .await
            .resolve_profile(None)
            .await
            .unwrap();
        scope
            .resolve::<dyn StudyProfileRepository>()
            .await
            .update(&StudyProfile {
                leech_threshold: threshold,
                leech_action: action,
                ..profile
            })
            .await
            .unwrap();
        scope
            .resolve::<dyn CardReviewRepository>()
            .await
            .upsert(&CardReview {
                lapses,
                ..scheduled_review(card_id)
            })
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn register_review_lapse_reaching_threshold_tags_card_as_leech() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        arrange_leech(&scope, card_id, 7, 8, LeechAction::TagOnly).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let actual = service
            .register_review(
                CardReview {
                    lapses: 8,
                    ..scheduled_review(card_id)
                },
                Rating::Again,
                None,
            )
            .await
            .unwrap();

        // Assert

        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let tags = meta_repo.get_tags(ElementId::Card(card_id)).await.unwrap();
        assert!(tags.iter().any(|tag| tag.name == LEECH_TAG));
        assert!(!meta_repo.get_by_id(card_id).await.unwrap().suspended);
        assert!(actual.leeched);
        assert!(!actual.suspended);
    }

    #[tokio::test]
    async fn register_review_leech_with_suspend_action_suspends_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        arrange_leech(&scope, card_id, 7, 8, LeechAction::Suspend).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let actual = service
            .register_review(
                CardReview {
                    lapses: 8,
                    ..scheduled_review(card_id)
                },
                Rating::Again,
                None,
            )
            .await
            .unwrap();

        // Assert

        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(card_id)
            .await
            .unwrap();
        assert!(meta.suspended);
        assert!(actual.suspended);
    }

    #[tokio::test]
    async fn register_review_lapse_below_threshold_leaves_card_untagged() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        arrange_leech(&scope, card_id, 6, 8, LeechAction::Suspend).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let actual = service
            .register_review(
                CardReview {
                    lapses: 7,
                    ..scheduled_review(card_id)
                },
                Rating::Again,
                None,
            )
            .await
            .unwrap();

        // Assert

        let tags = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_tags(ElementId::Card(card_id))
            .await
            .unwrap();
        assert!(tags.is_empty());
        assert!(!actual.leeched);
    }

    #[test]
    fn is_leech_lapse_each_half_threshold_past_it_flags_again() {
        // Arrange

        let lapses = [7, 8, 9, 10, 11, 12, 16];

        // Act

        let actual: Vec<bool> = lapses
            .iter()
            .map(|&current| is_leech_lapse(current - 1, current, 8))
            .collect();

        // Assert

        assert_eq!(vec![false, true, false, false, false, true, true], actual);
    }

    #[test]
    fn is_leech_lapse_zero_threshold_never_flags() {
        // Arrange

        let (previous, current) = (0, 1);

        // Act

        let actual = is_leech_lapse(previous, current, 0);

        // Assert

        assert!(!actual);
    }

    #[test]
    fn is_leech_lapse_unchanged_lapses_does_not_flag_again() {
        // Arrange

        let (previous, current) = (8, 8);

        // Act

        let actual = is_leech_lapse(previous, current, 8);

        // Assert

        assert!(!actual);
    }
}
