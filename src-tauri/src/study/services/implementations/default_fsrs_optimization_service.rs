use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::NaiveDate;
use fsrs::{FSRSItem, FSRSReview};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::services::fsrs_optimization_service::{
    FsrsOptimizationError, FsrsOptimizationService, FsrsTrainingSet,
};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::value_objects::rating::Rating;

#[derive(ScopeInjectable)]
pub struct DefaultFsrsOptimizationService {
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
}

#[async_trait]
impl FsrsOptimizationService for DefaultFsrsOptimizationService {
    async fn prepare_training_set(
        &self,
        profile_id: Uuid,
        num_relearning_steps: usize,
    ) -> Result<FsrsTrainingSet, FsrsOptimizationError> {
        let mut logs = self.card_review_log_repository.get_card_histories().await?;
        let card_ids: Vec<Uuid> = logs
            .chunk_by(|a, b| a.card_id == b.card_id)
            .filter_map(|card_logs| card_logs[0].card_id)
            .collect();
        let profile_cards: HashSet<Uuid> = self
            .profile_resolution_service
            .cards_using_profile(profile_id, &card_ids)
            .await?;
        logs.retain(|log| log.card_id.is_some_and(|id| profile_cards.contains(&id)));

        let items = build_training_items(&logs);
        log::info!(
            "Number of relevant reviews for training is {}.",
            items.len()
        );

        if items.is_empty() {
            return Err(FsrsOptimizationError::NotEnoughReviews);
        }
        Ok(FsrsTrainingSet {
            items,
            num_relearning_steps,
        })
    }
}

/// One item per review on a later day than the card's previous one, holding the card's history
/// up to that review, as the FSRS optimizer expects. `logs` must be ordered by card then time.
fn build_training_items(logs: &[CardReviewLog]) -> Vec<FSRSItem> {
    logs.chunk_by(|a, b| a.card_id == b.card_id)
        .flat_map(|card_logs| {
            let reviews = to_fsrs_reviews(card_logs);
            (2..=reviews.len())
                .filter(|&len| reviews[len - 1].delta_t > 0)
                .map(|len| FSRSItem {
                    reviews: reviews[..len].to_vec(),
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

/// `delta_t` counts UTC calendar days since the previous review (0 for the first), matching
/// how ts-fsrs's scheduler counts elapsed days.
fn to_fsrs_reviews(card_logs: &[CardReviewLog]) -> Vec<FSRSReview> {
    let mut previous_day: Option<NaiveDate> = None;
    card_logs
        .iter()
        .map(|log| {
            let day = log.reviewed_at.date_naive();
            let delta_t = previous_day.map_or(0, |previous| (day - previous).num_days().max(0));
            previous_day = Some(day);
            FSRSReview {
                rating: fsrs_rating(log.rating),
                delta_t: delta_t as u32,
            }
        })
        .collect()
}

fn fsrs_rating(rating: Rating) -> u32 {
    match rating {
        Rating::Again => 1,
        Rating::Hard => 2,
        Rating::Good => 3,
        Rating::Easy => 4,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Duration, TimeZone, Utc};
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::repositories::meta_repository::MetaRepository,
        infrastructure::repositories::sqlite::{
            sqlite_card_review_log_repository::SqliteCardReviewLogRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::{
            repositories::study_profile_repository::StudyProfileRepository,
            services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    fn noon(day: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap() + Duration::days(day)
    }

    fn log(card_id: Uuid, day: i64, rating: Rating) -> CardReviewLog {
        CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at: noon(day),
            rating,
            duration_ms: None,
        }
    }

    fn review(rating: u32, delta_t: u32) -> FSRSReview {
        FSRSReview { rating, delta_t }
    }

    #[test]
    fn build_training_items_card_history_yields_one_item_per_later_review() {
        // Arrange

        let card = Uuid::new_v4();
        let logs = vec![
            log(card, 0, Rating::Again),
            log(card, 1, Rating::Good),
            log(card, 4, Rating::Easy),
        ];

        // Act

        let items = build_training_items(&logs);

        // Assert

        assert_eq!(
            vec![
                FSRSItem {
                    reviews: vec![review(1, 0), review(3, 1)],
                },
                FSRSItem {
                    reviews: vec![review(1, 0), review(3, 1), review(4, 3)],
                },
            ],
            items
        );
    }

    #[test]
    fn build_training_items_same_day_only_history_is_skipped() {
        // Arrange

        let card = Uuid::new_v4();
        let logs = vec![log(card, 0, Rating::Again), log(card, 0, Rating::Good)];

        // Act

        let items = build_training_items(&logs);

        // Assert

        assert!(items.is_empty());
    }

    #[test]
    fn build_training_items_same_day_review_after_long_term_one_is_not_an_item() {
        // Arrange

        let card = Uuid::new_v4();
        let mut relearned = log(card, 5, Rating::Good);
        relearned.reviewed_at += Duration::minutes(10);
        let logs = vec![
            log(card, 0, Rating::Good),
            log(card, 5, Rating::Again),
            relearned,
        ];

        // Act

        let items = build_training_items(&logs);

        // Assert

        assert_eq!(
            vec![FSRSItem {
                reviews: vec![review(3, 0), review(1, 5)],
            }],
            items
        );
    }

    #[test]
    fn build_training_items_reviews_across_utc_midnight_count_one_day_apart() {
        // Arrange

        let card = Uuid::new_v4();
        let before_midnight = Utc.with_ymd_and_hms(2026, 1, 1, 22, 0, 0).unwrap();
        let logs = vec![
            CardReviewLog {
                reviewed_at: before_midnight,
                ..log(card, 0, Rating::Good)
            },
            CardReviewLog {
                reviewed_at: before_midnight + Duration::hours(3),
                ..log(card, 0, Rating::Good)
            },
        ];

        // Act

        let items = build_training_items(&logs);

        // Assert

        assert_eq!(
            vec![FSRSItem {
                reviews: vec![review(3, 0), review(3, 1)],
            }],
            items
        );
    }

    #[test]
    fn fsrs_optimization_error_from_not_enough_data_returns_not_enough_reviews() {
        // Arrange

        let error = fsrs::FSRSError::NotEnoughData;

        // Act

        let actual = FsrsOptimizationError::from(error);

        // Assert

        assert!(matches!(actual, FsrsOptimizationError::NotEnoughReviews));
    }

    #[test]
    fn build_training_items_multiple_cards_keeps_histories_separate() {
        // Arrange

        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let logs = vec![
            log(first, 0, Rating::Good),
            log(first, 2, Rating::Good),
            log(second, 5, Rating::Hard),
            log(second, 6, Rating::Good),
        ];

        // Act

        let items = build_training_items(&logs);

        // Assert

        assert_eq!(
            vec![
                FSRSItem {
                    reviews: vec![review(3, 0), review(3, 2)],
                },
                FSRSItem {
                    reviews: vec![review(2, 0), review(3, 1)],
                },
            ],
            items
        );
    }

    #[tokio::test]
    async fn optimize_params_profile_without_reviews_returns_not_enough_reviews() {
        // Arrange

        let mut injector: Injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn CardReviewLogRepository,
            SqliteCardReviewLogRepository
        );
        register_scope!(
            injector,
            dyn FsrsOptimizationService,
            DefaultFsrsOptimizationService
        );
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn ProfileResolutionService,
            DefaultProfileResolutionService
        );
        let scope = injector.start_scope();
        let profile = scope
            .resolve::<dyn ProfileResolutionService>()
            .await
            .resolve_profile(None)
            .await
            .unwrap();
        let service = scope.resolve::<dyn FsrsOptimizationService>().await;

        // Act

        let result = service.prepare_training_set(profile.id, 1).await;

        // Assert

        assert!(matches!(
            result,
            Err(FsrsOptimizationError::NotEnoughReviews)
        ));
    }
}
