use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use fsrs::{FSRS, MemoryState, NextStates};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::services::card_grading_service::{
    CardDuePreview, CardGradingService, GradeCardError,
};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::value_objects::card_state::CardState;
use crate::study::value_objects::rating::Rating;

#[derive(ScopeInjectable)]
pub struct DefaultCardGradingService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
}

#[async_trait]
impl CardGradingService for DefaultCardGradingService {
    async fn grade_card(
        &self,
        card_id: Uuid,
        rating: Rating,
        duration_ms: Option<u32>,
    ) -> Result<CardReview, GradeCardError> {
        let (next_states, existing) = self.compute_next_states(card_id).await?;
        let now = Utc::now();
        let selected = select_state(&next_states, rating);

        let previous_state = existing
            .as_ref()
            .map(|review| review.state)
            .unwrap_or(CardState::New);
        let was_reviewed_before =
            matches!(previous_state, CardState::Review | CardState::Relearning);
        let is_lapse = rating == Rating::Again && was_reviewed_before;

        let review = CardReview {
            card_id,
            due: now + interval_to_duration(selected.interval),
            stability: selected.memory.stability,
            difficulty: selected.memory.difficulty,
            reps: existing.as_ref().map(|review| review.reps).unwrap_or(0) + 1,
            lapses: existing.as_ref().map(|review| review.lapses).unwrap_or(0)
                + u32::from(is_lapse),
            state: if rating == Rating::Again {
                if was_reviewed_before {
                    CardState::Relearning
                } else {
                    CardState::Learning
                }
            } else {
                CardState::Review
            },
            last_reviewed: Some(now),
        };

        self.card_review_repository.upsert(&review).await?;
        self.card_review_log_repository
            .create(&CardReviewLog {
                id: Uuid::new_v4(),
                card_id: Some(card_id),
                reviewed_at: now,
                rating,
                duration_ms,
            })
            .await?;

        Ok(review)
    }

    async fn preview_card(&self, card_id: Uuid) -> Result<CardDuePreview, GradeCardError> {
        let (next_states, _) = self.compute_next_states(card_id).await?;
        let now = Utc::now();

        Ok(CardDuePreview {
            again: now + interval_to_duration(next_states.again.interval),
            hard: now + interval_to_duration(next_states.hard.interval),
            good: now + interval_to_duration(next_states.good.interval),
            easy: now + interval_to_duration(next_states.easy.interval),
        })
    }

    async fn reset(&self, card_ids: Vec<Uuid>) -> Result<(), GradeCardError> {
        self.card_review_repository
            .delete_by_card_ids(card_ids)
            .await?;
        Ok(())
    }
}

impl DefaultCardGradingService {
    async fn compute_next_states(
        &self,
        card_id: Uuid,
    ) -> Result<(NextStates, Option<CardReview>), GradeCardError> {
        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(ElementId::Card(card_id)))
            .await?;
        let fsrs = FSRS::new(profile.fsrs_params.as_deref().unwrap_or(&[]))?;

        let existing = self.card_review_repository.get_by_card_id(card_id).await?;
        let now = Utc::now();

        let current_memory_state = existing.as_ref().map(|review| MemoryState {
            stability: review.stability,
            difficulty: review.difficulty,
        });
        let elapsed_days = existing
            .as_ref()
            .and_then(|review| review.last_reviewed)
            .map(|last_reviewed| elapsed_days_between(last_reviewed, now))
            .unwrap_or(0);

        let next_states = fsrs.next_states(
            current_memory_state,
            profile.desired_retention,
            elapsed_days,
        )?;

        Ok((next_states, existing))
    }
}

fn elapsed_days_between(last_reviewed: DateTime<Utc>, now: DateTime<Utc>) -> u32 {
    (now - last_reviewed).num_days().max(0) as u32
}

fn interval_to_duration(interval_days: f32) -> Duration {
    Duration::seconds((interval_days as f64 * 86400.0).round() as i64)
}

fn select_state(next_states: &NextStates, rating: Rating) -> &fsrs::ItemState {
    match rating {
        Rating::Again => &next_states.again,
        Rating::Hard => &next_states.hard,
        Rating::Good => &next_states.good,
        Rating::Easy => &next_states.easy,
    }
}

#[cfg(test)]
mod tests {
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

    #[tokio::test]
    async fn grade_card_new_card_rated_good_transitions_to_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let review = service
            .grade_card(card_id, Rating::Good, Some(1000))
            .await
            .unwrap();

        // Assert

        assert_eq!(CardState::Review, review.state);
        assert_eq!(1, review.reps);
        assert_eq!(0, review.lapses);
    }

    #[tokio::test]
    async fn grade_card_new_card_rated_again_transitions_to_learning_without_lapse() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;

        // Act

        let review = service
            .grade_card(card_id, Rating::Again, None)
            .await
            .unwrap();

        // Assert

        assert_eq!(CardState::Learning, review.state);
        assert_eq!(0, review.lapses);
    }

    #[tokio::test]
    async fn grade_card_review_card_rated_again_lapses_and_becomes_relearning() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        service
            .grade_card(card_id, Rating::Good, None)
            .await
            .unwrap();

        // Act

        let review = service
            .grade_card(card_id, Rating::Again, None)
            .await
            .unwrap();

        // Assert

        assert_eq!(CardState::Relearning, review.state);
        assert_eq!(1, review.lapses);
        assert_eq!(2, review.reps);
    }

    #[tokio::test]
    async fn reset_previously_graded_card_reverts_to_never_reviewed() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_id = create_test_card(&scope).await;
        let service = scope.resolve::<dyn CardGradingService>().await;
        service
            .grade_card(card_id, Rating::Good, None)
            .await
            .unwrap();

        // Act

        service.reset(vec![card_id]).await.unwrap();
        let card_review_repository = scope.resolve::<dyn CardReviewRepository>().await;
        let actual = card_review_repository
            .get_by_card_id(card_id)
            .await
            .unwrap();

        // Assert

        assert!(actual.is_none());
    }
}
