use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search::SavedSearch;
use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;
use crate::saved_searches::repositories::saved_search_repository::SavedSearchRepository;
use crate::saved_searches::services::saved_search_service::SavedSearchService;

#[derive(ScopeInjectable)]
pub struct DefaultSavedSearchService {
    saved_search_repository: Arc<dyn SavedSearchRepository>,
}

#[async_trait]
impl SavedSearchService for DefaultSavedSearchService {
    async fn list_saved_searches(&self) -> Result<Vec<SavedSearch>, RepositoryError> {
        self.saved_search_repository.get_all().await
    }

    async fn get_saved_search_filters(
        &self,
        id: Uuid,
    ) -> Result<Vec<SavedSearchFilter>, RepositoryError> {
        self.saved_search_repository.get_filters(id).await
    }

    async fn create_saved_search(
        &self,
        name: String,
        filters: Vec<SavedSearchFilter>,
    ) -> Result<SavedSearch, RepositoryError> {
        let now = Utc::now();
        let saved_search = SavedSearch {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name,
        };
        self.saved_search_repository.create(&saved_search).await?;
        self.saved_search_repository
            .replace_filters(saved_search.id, &filters)
            .await?;
        Ok(saved_search)
    }

    async fn rename_saved_search(
        &self,
        id: Uuid,
        name: String,
    ) -> Result<SavedSearch, RepositoryError> {
        let existing = self.saved_search_repository.get_by_id(id).await?;
        let saved_search = SavedSearch { name, ..existing };
        self.saved_search_repository.update(&saved_search).await?;
        Ok(saved_search)
    }

    async fn update_saved_search_filters(
        &self,
        id: Uuid,
        filters: Vec<SavedSearchFilter>,
    ) -> Result<(), RepositoryError> {
        self.saved_search_repository
            .replace_filters(id, &filters)
            .await
    }

    async fn duplicate_saved_search(&self, id: Uuid) -> Result<SavedSearch, RepositoryError> {
        let existing = self.saved_search_repository.get_by_id(id).await?;
        let filters = self.saved_search_repository.get_filters(id).await?;
        let now = Utc::now();
        let clone = SavedSearch {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: format!("{} (copy)", existing.name),
        };
        self.saved_search_repository.create(&clone).await?;
        self.saved_search_repository
            .replace_filters(clone.id, &filters)
            .await?;
        Ok(clone)
    }

    async fn delete_saved_search(&self, id: Uuid) -> Result<(), RepositoryError> {
        self.saved_search_repository.delete(id).await
    }
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::infrastructure::repositories::sqlite::sqlite_saved_search_repository::SqliteSavedSearchRepository;
    use crate::saved_searches::entities::saved_search_filter::{
        ElementFilter, NameFilterOperator, TagsFilterOperator,
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
        register_scope!(injector, dyn SavedSearchService, DefaultSavedSearchService);
        injector
    }

    fn make_filters() -> Vec<SavedSearchFilter> {
        vec![SavedSearchFilter {
            index: 0,
            filter: ElementFilter::Name {
                id: Uuid::new_v4(),
                operator: NameFilterOperator::Contains,
                value: "x".into(),
            },
        }]
    }

    #[tokio::test]
    async fn create_saved_search_valid_name_and_filters_returns_new_saved_search() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;

        // Act

        let saved_search = service
            .create_saved_search("Philosophy backlog".into(), make_filters())
            .await
            .unwrap();

        // Assert

        assert_eq!("Philosophy backlog", saved_search.name);
    }

    #[tokio::test]
    async fn get_saved_search_filters_existing_saved_search_returns_its_filters() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;
        let filters = make_filters();
        let saved_search = service
            .create_saved_search("Original".into(), filters.clone())
            .await
            .unwrap();

        // Act

        let actual = service
            .get_saved_search_filters(saved_search.id)
            .await
            .unwrap();

        // Assert

        assert_eq!(filters, actual);
    }

    #[tokio::test]
    async fn rename_saved_search_existing_saved_search_changes_name_only() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;
        let filters = make_filters();
        let saved_search = service
            .create_saved_search("Original".into(), filters.clone())
            .await
            .unwrap();

        // Act

        let renamed = service
            .rename_saved_search(saved_search.id, "Renamed".into())
            .await
            .unwrap();
        let renamed_filters = service.get_saved_search_filters(renamed.id).await.unwrap();

        // Assert

        assert_eq!("Renamed", renamed.name);
        assert_eq!(filters, renamed_filters);
    }

    #[tokio::test]
    async fn update_saved_search_filters_existing_saved_search_replaces_filters_only() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;
        let saved_search = service
            .create_saved_search("Original".into(), make_filters())
            .await
            .unwrap();
        let new_filters = vec![SavedSearchFilter {
            index: 0,
            filter: ElementFilter::Tags {
                id: Uuid::new_v4(),
                operator: TagsFilterOperator::IsAnyOf,
                tags: vec!["x".into()],
            },
        }];

        // Act

        service
            .update_saved_search_filters(saved_search.id, new_filters.clone())
            .await
            .unwrap();
        let actual = service
            .get_saved_search_filters(saved_search.id)
            .await
            .unwrap();

        // Assert

        assert_eq!(new_filters, actual);
    }

    #[tokio::test]
    async fn duplicate_saved_search_existing_saved_search_creates_copy_with_new_id() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;
        let filters = make_filters();
        let saved_search = service
            .create_saved_search("Original".into(), filters.clone())
            .await
            .unwrap();

        // Act

        let duplicate = service
            .duplicate_saved_search(saved_search.id)
            .await
            .unwrap();
        let duplicate_filters = service
            .get_saved_search_filters(duplicate.id)
            .await
            .unwrap();

        // Assert

        assert_ne!(saved_search.id, duplicate.id);
        assert_eq!("Original (copy)", duplicate.name);
        assert_eq!(filters, duplicate_filters);
    }

    #[tokio::test]
    async fn delete_saved_search_existing_saved_search_removes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn SavedSearchService>().await;
        let saved_search = service
            .create_saved_search("Original".into(), make_filters())
            .await
            .unwrap();

        // Act

        service.delete_saved_search(saved_search.id).await.unwrap();
        let remaining = service.list_saved_searches().await.unwrap();

        // Assert

        assert!(!remaining.iter().any(|s| s.id == saved_search.id));
    }
}
