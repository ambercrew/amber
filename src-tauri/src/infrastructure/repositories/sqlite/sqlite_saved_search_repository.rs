use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::repositories::sqlite::sqlite_rows::saved_search_filter_row::SavedSearchFilterRow;
use crate::infrastructure::repositories::sqlite::sqlite_rows::saved_search_row::SavedSearchRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;
use crate::saved_searches::repositories::saved_search_repository::SavedSearchRepository;

#[derive(ScopeInjectable)]
pub struct SqliteSavedSearchRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl SavedSearchRepository for SqliteSavedSearchRepository {
    async fn create(&self, saved_search: &SavedSearch) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO saved_searches (id, created_at, modified_at, name)
            VALUES ($1, datetime($2), datetime($3), $4)"#,
            saved_search.id.hyphenated(),
            saved_search.created_at,
            saved_search.modified_at,
            saved_search.name,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn update(&self, saved_search: &SavedSearch) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"UPDATE saved_searches SET name = $1 WHERE id = $2"#,
            saved_search.name,
            saved_search.id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"DELETE FROM saved_searches WHERE id = $1"#,
            id.hyphenated()
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<SavedSearch, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            SavedSearchRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name
            FROM saved_searches
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn get_all(&self) -> Result<Vec<SavedSearch>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            SavedSearchRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name
            FROM saved_searches
            ORDER BY created_at ASC"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(SavedSearch::from).collect())
    }

    async fn get_filters(
        &self,
        saved_search_id: Uuid,
    ) -> Result<Vec<SavedSearchFilter>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            SavedSearchFilterRow,
            r#"SELECT
                position as "index: i64",
                filter
            FROM saved_search_filters
            WHERE saved_search_id = $1
            ORDER BY position ASC"#,
            saved_search_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(SavedSearchFilter::from).collect())
    }

    async fn replace_filters(
        &self,
        saved_search_id: Uuid,
        filters: &[SavedSearchFilter],
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"DELETE FROM saved_search_filters WHERE saved_search_id = $1"#,
            saved_search_id.hyphenated()
        )
        .execute(&mut *tx)
        .await?;

        for filter in filters {
            let id = Uuid::new_v4();
            let filter_json =
                serde_json::to_string(&filter.filter).expect("Cannot serialize filter");

            sqlx::query!(
                r#"INSERT INTO saved_search_filters (id, saved_search_id, position, filter)
                VALUES ($1, $2, $3, $4)"#,
                id.hyphenated(),
                saved_search_id.hyphenated(),
                filter.index,
                filter_json,
            )
            .execute(&mut *tx)
            .await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use injector::{injector::Injector, register_scope};

    use crate::saved_searches::entities::saved_search_filter::{
        ElementFilter, StringFilterOperator, TagsFilterOperator,
    };
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn SavedSearchRepository,
            SqliteSavedSearchRepository
        );
        injector
    }

    fn make_saved_search() -> SavedSearch {
        let now = Utc::now();
        SavedSearch {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: "test".into(),
        }
    }

    #[tokio::test]
    async fn create_and_get_by_id_valid_saved_search_returns_same_saved_search() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn SavedSearchRepository>().await;
        let saved_search = make_saved_search();

        // Act

        repo.create(&saved_search).await.unwrap();
        let actual = repo.get_by_id(saved_search.id).await.unwrap();

        // Assert

        assert_eq!(saved_search.id, actual.id);
        assert_eq!(saved_search.name, actual.name);
    }

    #[tokio::test]
    async fn get_all_multiple_saved_searches_returns_all_of_them() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn SavedSearchRepository>().await;
        repo.create(&make_saved_search()).await.unwrap();
        repo.create(&make_saved_search()).await.unwrap();

        // Act

        let actual = repo.get_all().await.unwrap();

        // Assert

        assert_eq!(2, actual.len());
    }

    #[tokio::test]
    async fn replace_filters_and_get_filters_new_filters_returns_them_in_order() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn SavedSearchRepository>().await;
        let saved_search = make_saved_search();
        repo.create(&saved_search).await.unwrap();
        let filters = vec![
            SavedSearchFilter {
                index: 0,
                filter: ElementFilter::Name {
                    id: Uuid::new_v4(),
                    operator: StringFilterOperator::Contains,
                    value: "x".into(),
                },
            },
            SavedSearchFilter {
                index: 1,
                filter: ElementFilter::Tags {
                    id: Uuid::new_v4(),
                    operator: TagsFilterOperator::IsAnyOf,
                    tags: vec!["y".into()],
                },
            },
        ];

        // Act

        repo.replace_filters(saved_search.id, &filters)
            .await
            .unwrap();
        let actual = repo.get_filters(saved_search.id).await.unwrap();

        // Assert

        assert_eq!(filters, actual);
    }

    #[tokio::test]
    async fn replace_filters_existing_filters_replaces_them() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn SavedSearchRepository>().await;
        let saved_search = make_saved_search();
        repo.create(&saved_search).await.unwrap();
        repo.replace_filters(
            saved_search.id,
            &[SavedSearchFilter {
                index: 0,
                filter: ElementFilter::Name {
                    id: Uuid::new_v4(),
                    operator: StringFilterOperator::Contains,
                    value: "x".into(),
                },
            }],
        )
        .await
        .unwrap();
        let new_filters = vec![SavedSearchFilter {
            index: 0,
            filter: ElementFilter::Tags {
                id: Uuid::new_v4(),
                operator: TagsFilterOperator::IsAnyOf,
                tags: vec!["y".into()],
            },
        }];

        // Act

        repo.replace_filters(saved_search.id, &new_filters)
            .await
            .unwrap();
        let actual = repo.get_filters(saved_search.id).await.unwrap();

        // Assert

        assert_eq!(new_filters, actual);
    }
}
