use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::card_review_log::CardReviewLog;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;

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
            r#"INSERT INTO card_review_logs (id, card_id, reviewed_at, rating, duration_ms)
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
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
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

    #[tokio::test]
    async fn create_valid_log_succeeds() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewLogRepository>().await;
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
        let log = CardReviewLog {
            id: Uuid::new_v4(),
            card_id: Some(card_id),
            reviewed_at: Utc::now(),
            rating: Rating::Good,
            duration_ms: Some(1500),
        };

        // Act

        let result = repo.create(&log).await;

        // Assert

        assert!(result.is_ok());
    }
}
