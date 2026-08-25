use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
use crate::bibliographical_sources::repositories::bibliographical_source_repository::BibliographicalSourceRepository;
use crate::common::repository_error::RepositoryError;
use crate::infrastructure::repositories::sqlite::sqlite_rows::bibliographical_source_row::BibliographicalSourceRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteBibliographicalSourceRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl BibliographicalSourceRepository for SqliteBibliographicalSourceRepository {
    async fn create(&self, source: &BibliographicalSource) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO bibliographical_sources
                (id, created_at, modified_at, title, authors, publication_date, type, location)
            VALUES ($1, datetime($2), datetime($3), $4, $5, $6, $7, $8)"#,
            source.id.hyphenated(),
            source.created_at,
            source.modified_at,
            source.title,
            source.authors,
            source.publication_date,
            source.source_type.as_str(),
            source.location,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn update(&self, source: &BibliographicalSource) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"UPDATE bibliographical_sources SET
                title = $1,
                authors = $2,
                publication_date = $3,
                type = $4,
                location = $5
            WHERE id = $6"#,
            source.title,
            source.authors,
            source.publication_date,
            source.source_type.as_str(),
            source.location,
            source.id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"DELETE FROM bibliographical_sources WHERE id = $1"#,
            id.hyphenated()
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<BibliographicalSource, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            BibliographicalSourceRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                title,
                authors,
                publication_date,
                type as "source_type: _",
                location
            FROM bibliographical_sources
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn get_all(&self) -> Result<Vec<BibliographicalSource>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            BibliographicalSourceRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                title,
                authors,
                publication_date,
                type as "source_type: _",
                location
            FROM bibliographical_sources
            ORDER BY title"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    async fn find_by_location(
        &self,
        location: &str,
    ) -> Result<Option<BibliographicalSource>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            BibliographicalSourceRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                title,
                authors,
                publication_date,
                type as "source_type: _",
                location
            FROM bibliographical_sources
            WHERE location = $1
            LIMIT 1"#,
            location
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|row| row.into()))
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use injector::{injector::Injector, register_scope};

    use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
        injector
    }

    fn make_bibliographical_source(location: Option<&str>) -> BibliographicalSource {
        let now = Utc::now();
        BibliographicalSource {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            title: "test".into(),
            authors: None,
            publication_date: None,
            source_type: BibliographicalSourceType::WebPage,
            location: location.map(|l| l.to_string()),
        }
    }

    #[tokio::test]
    async fn create_and_get_by_id_valid_source_returns_same_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn BibliographicalSourceRepository>().await;
        let source = make_bibliographical_source(Some("https://example.com"));

        // Act

        repo.create(&source).await.unwrap();
        let actual = repo.get_by_id(source.id).await.unwrap();

        // Assert

        assert_eq!(source.id, actual.id);
        assert_eq!(source.location, actual.location);
    }

    #[tokio::test]
    async fn update_existing_source_changes_fields() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn BibliographicalSourceRepository>().await;
        let source = make_bibliographical_source(None);
        repo.create(&source).await.unwrap();

        // Act

        let updated = BibliographicalSource {
            title: "renamed".into(),
            ..source.clone()
        };
        repo.update(&updated).await.unwrap();
        let actual = repo.get_by_id(source.id).await.unwrap();

        // Assert

        assert_eq!("renamed", actual.title);
    }

    #[tokio::test]
    async fn find_by_location_matching_location_returns_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn BibliographicalSourceRepository>().await;
        let source = make_bibliographical_source(Some("https://example.com"));
        repo.create(&source).await.unwrap();

        // Act

        let actual = repo.find_by_location("https://example.com").await.unwrap();

        // Assert

        assert_eq!(Some(source.id), actual.map(|s| s.id));
    }

    #[tokio::test]
    async fn find_by_location_no_match_returns_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn BibliographicalSourceRepository>().await;

        // Act

        let actual = repo.find_by_location("https://none.com").await.unwrap();

        // Assert

        assert!(actual.is_none());
    }
}
