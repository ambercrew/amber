use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use fractional_index::FractionalIndex;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::element_id_with_priority::ElementIdWithPriority;
use crate::infrastructure::repositories::sqlite::sqlite_rows::card_review_row::CardReviewRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::card_review::CardReview;
use crate::study::repositories::card_review_repository::CardReviewRepository;

#[derive(ScopeInjectable)]
pub struct SqliteCardReviewRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl CardReviewRepository for SqliteCardReviewRepository {
    async fn get_by_card_id(&self, card_id: Uuid) -> Result<Option<CardReview>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            CardReviewRow,
            r#"SELECT
                card_id as "card_id: _",
                due as "due: _",
                stability,
                difficulty,
                reps,
                lapses,
                state,
                last_reviewed as "last_reviewed: _"
            FROM card_reviews
            WHERE card_id = $1"#,
            card_id
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|value| value.into()))
    }

    async fn upsert(&self, review: &CardReview) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let state = review.state.as_str();

        sqlx::query!(
            r#"INSERT INTO card_reviews
                (card_id, due, stability, difficulty, reps, lapses, state, last_reviewed)
            VALUES ($1, datetime($2), $3, $4, $5, $6, $7, datetime($8))
            ON CONFLICT (card_id) DO UPDATE SET
                due = excluded.due,
                stability = excluded.stability,
                difficulty = excluded.difficulty,
                reps = excluded.reps,
                lapses = excluded.lapses,
                state = excluded.state,
                last_reviewed = excluded.last_reviewed"#,
            review.card_id,
            review.due,
            review.stability,
            review.difficulty,
            review.reps,
            review.lapses,
            state,
            review.last_reviewed,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_due_cards(
        &self,
        as_of: DateTime<Utc>,
    ) -> Result<Vec<ElementIdWithPriority>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let due = sqlx::query!(
            r#"SELECT c.id as "id: uuid::Uuid", m.priority
            FROM cards c
            JOIN meta m ON m.element_id = c.id
            LEFT JOIN card_reviews cr ON cr.card_id = c.id
            WHERE m.trashed_at IS NULL
              AND (cr.card_id IS NULL OR cr.due <= datetime($1))"#,
            as_of
        )
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| ElementIdWithPriority {
            element_id: ElementId::Card(row.id),
            priority: FractionalIndex::from_bytes(row.priority).expect("Invalid fractional index"),
        })
        .collect();

        Ok(due)
    }

    async fn delete_by_card_ids(&self, card_ids: Vec<Uuid>) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        for card_id in card_ids {
            sqlx::query!("DELETE FROM card_reviews WHERE card_id = $1", card_id)
                .execute(&mut *tx)
                .await?;
        }

        Ok(())
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
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
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
        injector
    }

    fn make_card_meta(id: Uuid) -> Meta {
        Meta {
            element_id: ElementId::Card(id),
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

    fn make_review(card_id: Uuid) -> CardReview {
        CardReview {
            card_id,
            due: Utc::now(),
            stability: 1.0,
            difficulty: 5.0,
            reps: 1,
            lapses: 0,
            state: CardState::Learning,
            last_reviewed: Some(Utc::now()),
        }
    }

    #[tokio::test]
    async fn upsert_and_get_by_card_id_new_review_returns_same_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        let review = make_review(card_id);

        // Act

        repo.upsert(&review).await.unwrap();
        let actual = repo.get_by_card_id(card_id).await.unwrap().unwrap();

        // Assert

        assert_eq!(review.card_id, actual.card_id);
        assert_eq!(review.state, actual.state);
    }

    #[tokio::test]
    async fn upsert_existing_review_updates_in_place() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        repo.upsert(&make_review(card_id)).await.unwrap();

        // Act

        let updated = CardReview {
            reps: 2,
            state: CardState::Review,
            ..make_review(card_id)
        };
        repo.upsert(&updated).await.unwrap();
        let actual = repo.get_by_card_id(card_id).await.unwrap().unwrap();

        // Assert

        assert_eq!(2, actual.reps);
        assert_eq!(CardState::Review, actual.state);
    }

    #[tokio::test]
    async fn get_due_cards_new_and_overdue_cards_returns_both() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewRepository>().await;

        let new_card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(new_card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();

        let overdue_card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(overdue_card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        repo.upsert(&CardReview {
            due: Utc::now() - chrono::Duration::days(1),
            ..make_review(overdue_card_id)
        })
        .await
        .unwrap();

        let future_card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(future_card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        repo.upsert(&CardReview {
            due: Utc::now() + chrono::Duration::days(30),
            ..make_review(future_card_id)
        })
        .await
        .unwrap();

        // Act

        let due: Vec<Uuid> = repo
            .get_due_cards(Utc::now())
            .await
            .unwrap()
            .into_iter()
            .map(|entry| entry.element_id.id())
            .collect();

        // Assert

        assert!(due.contains(&new_card_id));
        assert!(due.contains(&overdue_card_id));
        assert!(!due.contains(&future_card_id));
    }

    #[tokio::test]
    async fn delete_by_card_ids_existing_review_removes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let repo = scope.resolve::<dyn CardReviewRepository>().await;
        let card_id = Uuid::new_v4();
        card_repo
            .create(Card {
                meta: make_card_meta(card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        repo.upsert(&make_review(card_id)).await.unwrap();

        // Act

        repo.delete_by_card_ids(vec![card_id]).await.unwrap();
        let actual = repo.get_by_card_id(card_id).await.unwrap();

        // Assert

        assert!(actual.is_none());
    }
}
