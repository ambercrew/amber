use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::statistics::repositories::statistics_repository::StatisticsRepository;
use crate::statistics::value_objects::daily_activity::DailyActivity;
use crate::statistics::value_objects::daily_forecast::DailyForecast;
use crate::statistics::value_objects::element_counts::ElementCounts;

#[derive(ScopeInjectable)]
pub struct SqliteStatisticsRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl StatisticsRepository for SqliteStatisticsRepository {
    async fn count_reviewed_elements(
        &self,
        date: NaiveDate,
    ) -> Result<ElementCounts, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // Same learning asset filter as the daily activity, so the counts match the heatmap.
        let row = sqlx::query!(
            r#"SELECT
                (SELECT COUNT(DISTINCT l.element_id) FROM learning_asset_review_logs l
                    JOIN meta m ON m.element_id = l.element_id
                    WHERE m.element_type = 'learning_asset'
                        AND date(l.reviewed_at, 'localtime') = $1
                        AND (l.action = 'next' OR l.duration_ms IS NOT NULL)) AS "learning_assets!: i64",
                (SELECT COUNT(DISTINCT l.element_id) FROM learning_asset_review_logs l
                    JOIN meta m ON m.element_id = l.element_id
                    WHERE m.element_type = 'extract'
                        AND date(l.reviewed_at, 'localtime') = $1
                        AND (l.action = 'next' OR l.duration_ms IS NOT NULL)) AS "extracts!: i64",
                (SELECT COUNT(DISTINCT card_id) FROM card_review_logs
                    WHERE date(reviewed_at, 'localtime') = $1) AS "cards!: i64""#,
            date
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(ElementCounts {
            learning_assets: row.learning_assets,
            extracts: row.extracts,
            cards: row.cards,
        })
    }

    async fn get_daily_activity_since(
        &self,
        since: DateTime<Utc>,
        max_review_duration_ms: u64,
    ) -> Result<Vec<DailyActivity>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let max_review_duration_ms = i64::try_from(max_review_duration_ms).unwrap_or(i64::MAX);

        // Finishes without a duration come from outside a study session (bulk finish, the toggle).
        let rows = sqlx::query!(
            r#"SELECT
                date(reviewed_at, 'localtime') AS "date!: NaiveDate",
                COUNT(*) AS "reviews!: i64",
                SUM(MIN(MAX(COALESCE(duration_ms, 0), 0), $2)) AS "duration_ms!: i64"
            FROM (
                SELECT reviewed_at, duration_ms FROM card_review_logs
                WHERE reviewed_at >= datetime($1)
                UNION ALL
                SELECT reviewed_at, duration_ms FROM learning_asset_review_logs
                WHERE reviewed_at >= datetime($1)
                    AND (action = 'next' OR duration_ms IS NOT NULL)
            )
            GROUP BY 1
            ORDER BY 1"#,
            since,
            max_review_duration_ms
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| DailyActivity {
                date: row.date,
                reviews: u32::try_from(row.reviews).unwrap_or(u32::MAX),
                duration_ms: u64::try_from(row.duration_ms).unwrap_or(0),
            })
            .collect())
    }

    async fn get_daily_forecast(
        &self,
        from: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<Vec<DailyForecast>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT
                date(due, 'localtime') AS "date!: NaiveDate",
                COUNT(*) AS "reviews!: i64"
            FROM (
                SELECT cr.due FROM card_reviews cr
                JOIN meta m ON m.element_id = cr.card_id
                WHERE m.trashed_at IS NULL
                UNION ALL
                SELECT lar.due FROM learning_asset_reviews lar
                JOIN meta m ON m.element_id = lar.element_id
                WHERE m.trashed_at IS NULL AND lar.finished_at IS NULL
            )
            WHERE datetime(due) >= datetime($1) AND datetime(due) < datetime($2)
            GROUP BY 1
            ORDER BY 1"#,
            from,
            until
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| DailyForecast {
                date: row.date,
                reviews: u32::try_from(row.reviews).unwrap_or(u32::MAX),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Local};
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::{
                card::Card,
                learning_asset::{LearningAsset, LearningAssetContent},
            },
            repositories::{
                card_repository::CardRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{element_id::ElementId, meta::Meta, read_point::ReadPoint},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_log_repository::SqliteCardReviewLogRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        study::{
            entities::card_review::CardReview,
            entities::{
                card_review_log::CardReviewLog, learning_asset_review_log::LearningAssetReviewLog,
            },
            repositories::{
                card_review_log_repository::CardReviewLogRepository,
                card_review_repository::CardReviewRepository,
                learning_asset_review_log_repository::LearningAssetReviewLogRepository,
            },
            value_objects::{
                card_state::CardState, learning_asset_action::LearningAssetAction, rating::Rating,
            },
        },
        test_utils::create_test_injector,
    };

    use super::*;

    const MAX_DURATION_MS: u64 = 60 * 60 * 1000;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(
            injector,
            dyn LearningAssetReviewLogRepository,
            SqliteLearningAssetReviewLogRepository
        );
        register_scope!(
            injector,
            dyn CardReviewLogRepository,
            SqliteCardReviewLogRepository
        );
        register_scope!(
            injector,
            dyn CardReviewRepository,
            SqliteCardReviewRepository
        );
        register_scope!(
            injector,
            dyn StatisticsRepository,
            SqliteStatisticsRepository
        );
        injector
    }

    fn meta(element_id: ElementId) -> Meta {
        Meta {
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
        }
    }

    fn card(id: Uuid) -> Card {
        Card {
            meta: meta(ElementId::Card(id)),
            front: String::new(),
            back: String::new(),
        }
    }

    #[tokio::test]
    async fn count_reviewed_elements_reviews_on_several_days_counts_distinct_elements_on_date() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let card_log_repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let learning_asset_log_repo = scope
            .resolve::<dyn LearningAssetReviewLogRepository>()
            .await;
        let repo = scope.resolve::<dyn StatisticsRepository>().await;
        let now = Utc::now();
        let (card_id, other_card_id) = (Uuid::new_v4(), Uuid::new_v4());
        card_repo.create(card(card_id)).await.unwrap();
        card_repo.create(card(other_card_id)).await.unwrap();
        for (id, reviewed_at) in [
            (card_id, now),
            (card_id, now),
            (other_card_id, now - Duration::days(10)),
        ] {
            card_log_repo
                .create(&CardReviewLog {
                    id: Uuid::new_v4(),
                    card_id: Some(id),
                    reviewed_at,
                    rating: Rating::Good,
                    duration_ms: Some(1_000),
                })
                .await
                .unwrap();
        }
        let learning_asset_id = Uuid::new_v4();
        learning_asset_repo
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: meta(ElementId::LearningAsset(learning_asset_id)),
                    read_point: ReadPoint::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        learning_asset_log_repo
            .create(&LearningAssetReviewLog {
                id: Uuid::new_v4(),
                element_id: Some(learning_asset_id),
                reviewed_at: now,
                action: LearningAssetAction::Next,
                duration_ms: Some(1_000),
            })
            .await
            .unwrap();

        // Act

        let actual = repo
            .count_reviewed_elements(now.with_timezone(&Local).date_naive())
            .await
            .unwrap();

        // Assert

        assert_eq!(
            ElementCounts {
                learning_assets: 1,
                extracts: 0,
                cards: 1,
            },
            actual
        );
    }

    #[tokio::test]
    async fn get_daily_activity_since_older_and_newer_logs_returns_only_newer() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let log_repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let repo = scope.resolve::<dyn StatisticsRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo.create(card(card_id)).await.unwrap();
        let now = Utc::now();
        for (reviewed_at, duration_ms) in [(now - Duration::days(10), 1_000), (now, 2_000)] {
            log_repo
                .create(&CardReviewLog {
                    id: Uuid::new_v4(),
                    card_id: Some(card_id),
                    reviewed_at,
                    rating: Rating::Good,
                    duration_ms: Some(duration_ms),
                })
                .await
                .unwrap();
        }

        // Act

        let actual = repo
            .get_daily_activity_since(now - Duration::days(1), MAX_DURATION_MS)
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec![DailyActivity {
                date: now.with_timezone(&Local).date_naive(),
                reviews: 1,
                duration_ms: 2_000,
            }],
            actual
        );
    }

    #[tokio::test]
    async fn get_daily_activity_since_review_longer_than_cap_counts_capped_duration() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let log_repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let repo = scope.resolve::<dyn StatisticsRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo.create(card(card_id)).await.unwrap();
        for duration_ms in [Some(10 * 60 * 60 * 1000), Some(1_000), None] {
            log_repo
                .create(&CardReviewLog {
                    id: Uuid::new_v4(),
                    card_id: Some(card_id),
                    reviewed_at: Utc::now(),
                    rating: Rating::Good,
                    duration_ms,
                })
                .await
                .unwrap();
        }

        // Act

        let actual = repo
            .get_daily_activity_since(Utc::now() - Duration::days(1), MAX_DURATION_MS)
            .await
            .unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(3, actual[0].reviews);
        assert_eq!(MAX_DURATION_MS + 1_000, actual[0].duration_ms);
    }

    #[tokio::test]
    async fn get_daily_activity_since_finish_without_duration_excludes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let log_repo = scope
            .resolve::<dyn LearningAssetReviewLogRepository>()
            .await;
        let repo = scope.resolve::<dyn StatisticsRepository>().await;
        let element_id = Uuid::new_v4();
        learning_asset_repo
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: meta(ElementId::LearningAsset(element_id)),
                    read_point: ReadPoint::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        let logs = [
            (LearningAssetAction::Next, None),
            (LearningAssetAction::Finish, Some(3_000)),
            (LearningAssetAction::Finish, None),
        ];
        for (action, duration_ms) in logs {
            log_repo
                .create(&LearningAssetReviewLog {
                    id: Uuid::new_v4(),
                    element_id: Some(element_id),
                    reviewed_at: Utc::now(),
                    action,
                    duration_ms,
                })
                .await
                .unwrap();
        }

        // Act

        let actual = repo
            .get_daily_activity_since(Utc::now() - Duration::days(1), MAX_DURATION_MS)
            .await
            .unwrap();

        // Assert

        assert_eq!(2, actual[0].reviews);
    }

    #[tokio::test]
    async fn get_daily_forecast_cards_due_inside_and_outside_range_counts_only_inside() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let review_repo = scope.resolve::<dyn CardReviewRepository>().await;
        let repo = scope.resolve::<dyn StatisticsRepository>().await;
        let now = Utc::now();
        for due in [
            now,
            now + Duration::days(3),
            now + Duration::days(3),
            now + Duration::days(30),
        ] {
            let card_id = Uuid::new_v4();
            card_repo.create(card(card_id)).await.unwrap();
            review_repo
                .upsert(&CardReview {
                    card_id,
                    due,
                    stability: 1.0,
                    difficulty: 5.0,
                    reps: 1,
                    lapses: 0,
                    state: CardState::Review,
                    last_reviewed: Some(now),
                    scheduled_days: 3,
                    learning_steps: 0,
                })
                .await
                .unwrap();
        }

        // Act

        let actual = repo
            .get_daily_forecast(now + Duration::days(1), now + Duration::days(10))
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec![DailyForecast {
                date: (now + Duration::days(3)).with_timezone(&Local).date_naive(),
                reviews: 2,
            }],
            actual
        );
    }
}
