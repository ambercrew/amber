use std::sync::Arc;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::value_objects::rating::Rating;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;

#[derive(ScopeInjectable)]
pub struct SqliteCardReviewLogRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl CardReviewLogRepository for SqliteCardReviewLogRepository {
    async fn create(&self, log: &CardReviewLog) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rating = log.rating.as_str();

        sqlx::query!(
            r#"INSERT INTO card_review_logs
                (id, card_id, reviewed_at, rating, duration_ms)
            VALUES ($1, $2, datetime($3), $4, $5)"#,
            log.id.hyphenated(),
            log.card_id.map(|id| id.hyphenated()),
            log.reviewed_at,
            rating,
            log.duration_ms,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_card_histories(&self) -> Result<Vec<CardReviewLog>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT
                id AS "id!: uuid::fmt::Hyphenated",
                card_id AS "card_id: uuid::fmt::Hyphenated",
                reviewed_at AS "reviewed_at!: DateTime<Utc>",
                rating AS "rating!: String",
                duration_ms AS "duration_ms: u32"
            FROM card_review_logs
            WHERE card_id IS NOT NULL
            ORDER BY card_id, reviewed_at, rowid"#,
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| CardReviewLog {
                id: row.id.into_uuid(),
                card_id: row.card_id.map(|id| id.into_uuid()),
                reviewed_at: row.reviewed_at,
                rating: Rating::from(row.rating.as_str()),
                duration_ms: row.duration_ms,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, TimeZone};
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::repositories::meta_repository::MetaRepository,
        elements::{
            entities::card::Card,
            repositories::card_repository::CardRepository,
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        study::value_objects::rating::Rating,
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn CardReviewLogRepository,
            SqliteCardReviewLogRepository
        );
        injector
    }

    async fn create_card(card_repo: &Arc<dyn CardRepository>) -> Uuid {
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

    fn make_log(card_id: Uuid, reviewed_at: DateTime<Utc>) -> CardReviewLog {
        CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at,
            rating: Rating::Good,
            duration_ms: Some(1500),
        }
    }

    #[tokio::test]
    async fn create_valid_log_succeeds() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let card_id = create_card(&card_repo).await;
        let log = make_log(card_id, Utc::now());

        // Act

        let result = repo.create(&log).await;

        // Assert

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn get_card_histories_logs_of_two_cards_returns_them_ordered_by_card_then_time() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let mut card_ids = [create_card(&card_repo).await, create_card(&card_repo).await];
        card_ids.sort_by_key(|id| id.hyphenated().to_string());
        let start = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        let expected = vec![
            make_log(card_ids[0], start),
            make_log(card_ids[0], start + Duration::days(2)),
            make_log(card_ids[1], start + Duration::days(1)),
        ];
        for log in expected.iter().rev() {
            repo.create(log).await.unwrap();
        }

        // Act

        let actual = repo.get_card_histories().await.unwrap();

        // Assert

        assert_eq!(expected, actual);
    }
}
