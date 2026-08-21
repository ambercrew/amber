#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use fractional_index::FractionalIndex;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::element_id_with_priority::ElementIdWithPriority;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;

#[derive(ScopeInjectable)]
pub struct SqliteLearningAssetReviewRepository {
    tx: Arc<DbTransaction>,
}

fn element_id_from_type(id: Uuid, element_type: &str) -> ElementId {
    match element_type {
        "extract" => ElementId::Extract(id),
        _ => ElementId::LearningAsset(id),
    }
}

#[async_trait]
impl LearningAssetReviewRepository for SqliteLearningAssetReviewRepository {
    async fn get_by_element_id(
        &self,
        element_id: Uuid,
    ) -> Result<Option<LearningAssetReview>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query!(
            r#"SELECT
                m.element_id as "element_id: uuid::fmt::Hyphenated",
                m.element_type,
                rr.due as "due: DateTime<Utc>",
                rr.interval_days,
                rr.last_reviewed as "last_reviewed: DateTime<Utc>",
                rr.finished_at as "finished_at: DateTime<Utc>"
            FROM learning_asset_reviews rr
            INNER JOIN meta m ON m.element_id = rr.element_id
            WHERE rr.element_id = $1"#,
            element_id.hyphenated()
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|row| LearningAssetReview {
            element_id: element_id_from_type(row.element_id.into_uuid(), &row.element_type),
            due: row.due,
            interval_days: row.interval_days as f32,
            last_reviewed: row.last_reviewed,
            finished_at: row.finished_at,
        }))
    }

    async fn upsert(&self, review: &LearningAssetReview) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let element_id = review.element_id.id().hyphenated();

        sqlx::query!(
            r#"INSERT INTO learning_asset_reviews
                (element_id, due, interval_days, last_reviewed, finished_at)
            VALUES ($1, datetime($2), $3, datetime($4), datetime($5))
            ON CONFLICT (element_id) DO UPDATE SET
                due = excluded.due,
                interval_days = excluded.interval_days,
                last_reviewed = excluded.last_reviewed,
                finished_at = excluded.finished_at"#,
            element_id,
            review.due,
            review.interval_days,
            review.last_reviewed,
            review.finished_at,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_due_elements(
        &self,
        as_of: DateTime<Utc>,
    ) -> Result<Vec<ElementIdWithPriority>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT m.element_id as "element_id: uuid::fmt::Hyphenated", m.element_type, m.priority
            FROM meta m
            LEFT JOIN learning_asset_reviews rr ON rr.element_id = m.element_id
            WHERE m.element_type IN ('learning_asset', 'extract')
              AND m.trashed_at IS NULL
              AND (rr.element_id IS NULL OR (rr.finished_at IS NULL AND rr.due <= datetime($1)))"#,
            as_of
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ElementIdWithPriority {
                element_id: element_id_from_type(row.element_id.into_uuid(), &row.element_type),
                priority: FractionalIndex::from_bytes(row.priority)
                    .expect("Invalid fractional index"),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Duration;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::{
            entities::{extract::Extract, learning_asset::LearningAsset},
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
            sqlite_meta_repository::SqliteMetaRepository,
        },
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
        injector
    }

    fn make_meta(id: ElementId) -> Meta {
        Meta {
            element_id: id,
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

    fn make_review(element_id: ElementId) -> LearningAssetReview {
        LearningAssetReview {
            element_id,
            due: Utc::now(),
            interval_days: 1.0,
            last_reviewed: Some(Utc::now()),
            finished_at: None,
        }
    }

    #[tokio::test]
    async fn upsert_and_get_by_element_id_learning_asset_returns_same_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let repo = scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let learning_asset_id = ElementId::LearningAsset(Uuid::new_v4());
        learning_asset_repo
            .create(
                LearningAsset {
                    interval_multiplier: 1.2,
                    meta: make_meta(learning_asset_id),
                    read_point: ReadPoint::default(),
                },
                Vec::new(),
            )
            .await
            .unwrap();
        let review = make_review(learning_asset_id);

        // Act

        repo.upsert(&review).await.unwrap();
        let actual = repo
            .get_by_element_id(learning_asset_id.id())
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(learning_asset_id, actual.element_id);
        assert_eq!(review.interval_days, actual.interval_days);
    }

    #[tokio::test]
    async fn get_due_elements_new_overdue_and_finished_returns_only_due() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
        let repo = scope.resolve::<dyn LearningAssetReviewRepository>().await;

        let new_learning_asset_id = ElementId::LearningAsset(Uuid::new_v4());
        learning_asset_repo
            .create(
                LearningAsset {
                    interval_multiplier: 1.2,
                    meta: make_meta(new_learning_asset_id),
                    read_point: ReadPoint::default(),
                },
                Vec::new(),
            )
            .await
            .unwrap();

        let overdue_extract_id = ElementId::Extract(Uuid::new_v4());
        extract_repo
            .create(Extract {
                interval_multiplier: 1.2,
                meta: make_meta(overdue_extract_id),
                content: String::new(),
            })
            .await
            .unwrap();
        repo.upsert(&LearningAssetReview {
            due: Utc::now() - Duration::days(1),
            ..make_review(overdue_extract_id)
        })
        .await
        .unwrap();

        let finished_learning_asset_id = ElementId::LearningAsset(Uuid::new_v4());
        learning_asset_repo
            .create(
                LearningAsset {
                    interval_multiplier: 1.2,
                    meta: make_meta(finished_learning_asset_id),
                    read_point: ReadPoint::default(),
                },
                Vec::new(),
            )
            .await
            .unwrap();
        repo.upsert(&LearningAssetReview {
            due: Utc::now() - Duration::days(1),
            finished_at: Some(Utc::now()),
            ..make_review(finished_learning_asset_id)
        })
        .await
        .unwrap();

        // Act

        let due: Vec<ElementId> = repo
            .get_due_elements(Utc::now())
            .await
            .unwrap()
            .into_iter()
            .map(|entry| entry.element_id)
            .collect();

        // Assert

        assert!(due.contains(&new_learning_asset_id));
        assert!(due.contains(&overdue_extract_id));
        assert!(!due.contains(&finished_learning_asset_id));
    }
}
