use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::repositories::sqlite::sqlite_rows::study_profile_row::StudyProfileRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::repositories::study_profile_repository::StudyProfileRepository;

#[derive(ScopeInjectable)]
pub struct SqliteStudyProfileRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl StudyProfileRepository for SqliteStudyProfileRepository {
    async fn create(&self, profile: &StudyProfile) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let fsrs_params = profile
            .fsrs_params
            .as_ref()
            .map(|params| serde_json::to_string(params).expect("Cannot serialize fsrs_params"));

        sqlx::query!(
            r#"INSERT INTO study_profiles
                (id, created_at, modified_at, name, is_default, desired_retention, fsrs_params, initial_interval_multiplier, initial_interval_days, min_interval_days)
            VALUES ($1, datetime($2), datetime($3), $4, $5, $6, $7, $8, $9, $10)"#,
            profile.id.hyphenated(),
            profile.created_at,
            profile.modified_at,
            profile.name,
            profile.is_default,
            profile.desired_retention,
            fsrs_params,
            profile.initial_interval_multiplier,
            profile.initial_interval_days,
            profile.min_interval_days,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn update(&self, profile: &StudyProfile) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let fsrs_params = profile
            .fsrs_params
            .as_ref()
            .map(|params| serde_json::to_string(params).expect("Cannot serialize fsrs_params"));

        sqlx::query!(
            r#"UPDATE study_profiles SET
                name = $1,
                is_default = $2,
                desired_retention = $3,
                fsrs_params = $4,
                initial_interval_multiplier = $5,
                initial_interval_days = $6,
                min_interval_days = $7
            WHERE id = $8"#,
            profile.name,
            profile.is_default,
            profile.desired_retention,
            fsrs_params,
            profile.initial_interval_multiplier,
            profile.initial_interval_days,
            profile.min_interval_days,
            profile.id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"DELETE FROM study_profiles WHERE id = $1"#,
            id.hyphenated()
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<StudyProfile, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            StudyProfileRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name,
                is_default as "is_default: bool",
                desired_retention,
                fsrs_params,
                initial_interval_multiplier,
                initial_interval_days,
                min_interval_days
            FROM study_profiles
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn get_all(&self) -> Result<Vec<StudyProfile>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            StudyProfileRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name,
                is_default as "is_default: bool",
                desired_retention,
                fsrs_params,
                initial_interval_multiplier,
                initial_interval_days,
                min_interval_days
            FROM study_profiles
            ORDER BY is_default DESC, created_at ASC"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    async fn clear_default(&self) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(r#"UPDATE study_profiles SET is_default = 0"#)
            .execute(&mut *tx)
            .await?;
        Ok(())
    }

    async fn get_default_or_oldest(&self) -> Result<Option<StudyProfile>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            StudyProfileRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name,
                is_default as "is_default: bool",
                desired_retention,
                fsrs_params,
                initial_interval_multiplier,
                initial_interval_days,
                min_interval_days
            FROM study_profiles
            ORDER BY is_default DESC, created_at ASC
            LIMIT 1"#
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|value| value.into()))
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use injector::{injector::Injector, register_scope};

    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        injector
    }

    fn make_profile(is_default: bool) -> StudyProfile {
        let now = Utc::now();
        StudyProfile {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: "test".into(),
            is_default,
            desired_retention: 0.9,
            fsrs_params: Some(vec![0.1, 0.2]),
            initial_interval_multiplier: 1.2,
            initial_interval_days: 1.0,
            min_interval_days: 1.0,
        }
    }

    #[tokio::test]
    async fn create_and_get_by_id_valid_profile_returns_same_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let profile = make_profile(false);

        // Act

        repo.create(&profile).await.unwrap();
        let actual = repo.get_by_id(profile.id).await.unwrap();

        // Assert

        assert_eq!(profile.id, actual.id);
        assert_eq!(profile.fsrs_params, actual.fsrs_params);
    }

    #[tokio::test]
    async fn get_default_or_oldest_default_exists_returns_default() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn StudyProfileRepository>().await;

        let non_default = make_profile(false);
        let default = make_profile(true);
        repo.create(&non_default).await.unwrap();
        repo.create(&default).await.unwrap();

        // Act

        let actual = repo.get_default_or_oldest().await.unwrap().unwrap();

        // Assert

        assert_eq!(default.id, actual.id);
    }

    #[tokio::test]
    async fn get_default_or_oldest_no_profiles_returns_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn StudyProfileRepository>().await;

        // Act

        let actual = repo.get_default_or_oldest().await.unwrap();

        // Assert

        assert!(actual.is_none());
    }
}
