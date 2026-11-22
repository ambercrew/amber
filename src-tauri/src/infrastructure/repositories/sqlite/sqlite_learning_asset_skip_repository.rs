use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::{
    common::repository_error::RepositoryError,
    infrastructure::value_objects::db_transaction::DbTransaction,
    study::repositories::learning_asset_skip_repository::LearningAssetSkipRepository,
};

#[derive(ScopeInjectable)]
pub struct SqliteLearningAssetSkipRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl LearningAssetSkipRepository for SqliteLearningAssetSkipRepository {
    async fn record_skip(
        &self,
        element_id: Uuid,
        skipped_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        let element_id = element_id.hyphenated();
        let skipped_at = skipped_at.timestamp_millis();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO learning_asset_skips(element_id, skipped_at) VALUES ($1, $2)
            ON CONFLICT(element_id) DO UPDATE SET skipped_at = excluded.skipped_at"#,
            element_id,
            skipped_at
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_skipped_since(&self, since: DateTime<Utc>) -> Result<Vec<Uuid>, RepositoryError> {
        let since = since.timestamp_millis();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT element_id as "element_id: uuid::fmt::Hyphenated"
            FROM learning_asset_skips
            WHERE skipped_at >= $1
            ORDER BY skipped_at"#,
            since
        )
        .fetch_all(&mut *tx)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| row.element_id.into_uuid())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Duration;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::{
        element_id::ElementId, meta::Meta, name_source::NameSource,
    };
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn LearningAssetSkipRepository,
            SqliteLearningAssetSkipRepository
        );
        injector
    }

    async fn create_learning_asset_meta(meta_repo: &Arc<dyn MetaRepository>) -> Uuid {
        let id = Uuid::new_v4();
        meta_repo
            .create_meta(&Meta {
                element_id: ElementId::LearningAsset(id),
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
            })
            .await
            .unwrap();
        id
    }

    #[tokio::test]
    async fn get_skipped_since_skips_before_and_after_returns_later_ones_earliest_first() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let repo = scope.resolve::<dyn LearningAssetSkipRepository>().await;
        let (old, later, earlier) = (
            create_learning_asset_meta(&meta_repo).await,
            create_learning_asset_meta(&meta_repo).await,
            create_learning_asset_meta(&meta_repo).await,
        );
        let since = Utc::now();
        repo.record_skip(old, since - Duration::hours(1))
            .await
            .unwrap();
        repo.record_skip(later, since + Duration::minutes(2))
            .await
            .unwrap();
        repo.record_skip(earlier, since + Duration::minutes(1))
            .await
            .unwrap();

        // Act

        let actual = repo.get_skipped_since(since).await.unwrap();

        // Assert

        assert_eq!(vec![earlier, later], actual);
    }

    #[tokio::test]
    async fn record_skip_skipped_again_replaces_the_earlier_skip() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let repo = scope.resolve::<dyn LearningAssetSkipRepository>().await;
        let element = create_learning_asset_meta(&meta_repo).await;
        let since = Utc::now();
        repo.record_skip(element, since - Duration::days(1))
            .await
            .unwrap();

        // Act

        repo.record_skip(element, since).await.unwrap();

        // Assert

        assert_eq!(vec![element], repo.get_skipped_since(since).await.unwrap());
    }
}
