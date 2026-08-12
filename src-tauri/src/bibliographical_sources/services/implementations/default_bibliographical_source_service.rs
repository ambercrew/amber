use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
use crate::bibliographical_sources::repositories::bibliographical_source_repository::BibliographicalSourceRepository;
use crate::bibliographical_sources::services::bibliographical_source_service::{
    BibliographicalSourceFields, BibliographicalSourceService, BibliographicalSourceServiceError,
    BibliographicalSourceWithElementCount,
};
use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;
use crate::common::repository_error::RepositoryError;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;

#[derive(ScopeInjectable)]
pub struct DefaultBibliographicalSourceService {
    bibliographical_source_repository: Arc<dyn BibliographicalSourceRepository>,
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl BibliographicalSourceService for DefaultBibliographicalSourceService {
    async fn list_bibliographical_sources(
        &self,
    ) -> Result<Vec<BibliographicalSourceWithElementCount>, RepositoryError> {
        let bibliographical_sources = self.bibliographical_source_repository.get_all().await?;
        let mut result = Vec::with_capacity(bibliographical_sources.len());
        for bibliographical_source in bibliographical_sources {
            let element_count = self
                .meta_repository
                .count_by_bibliographical_source(bibliographical_source.id)
                .await?;
            result.push(BibliographicalSourceWithElementCount {
                bibliographical_source,
                element_count,
            });
        }
        Ok(result)
    }

    async fn get_bibliographical_source(
        &self,
        id: Uuid,
    ) -> Result<BibliographicalSourceWithElementCount, RepositoryError> {
        let bibliographical_source = self.bibliographical_source_repository.get_by_id(id).await?;
        let element_count = self
            .meta_repository
            .count_by_bibliographical_source(id)
            .await?;
        Ok(BibliographicalSourceWithElementCount {
            bibliographical_source,
            element_count,
        })
    }

    async fn create_or_reuse_bibliographical_source(
        &self,
        fields: BibliographicalSourceFields,
    ) -> Result<BibliographicalSource, RepositoryError> {
        if fields.source_type == BibliographicalSourceType::WebPage
            && let Some(location) = fields.location.as_deref().filter(|l| !l.is_empty())
            && let Some(existing) = self
                .bibliographical_source_repository
                .find_by_location(location)
                .await?
        {
            return Ok(existing);
        }

        let now = Utc::now();
        let source = BibliographicalSource {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            title: fields.title,
            authors: fields.authors,
            publication_date: fields.publication_date,
            source_type: fields.source_type,
            location: fields.location,
        };
        self.bibliographical_source_repository
            .create(&source)
            .await?;
        Ok(source)
    }

    async fn update_bibliographical_source(
        &self,
        id: Uuid,
        fields: BibliographicalSourceFields,
    ) -> Result<BibliographicalSource, RepositoryError> {
        let existing = self.bibliographical_source_repository.get_by_id(id).await?;
        let source = BibliographicalSource {
            title: fields.title,
            authors: fields.authors,
            publication_date: fields.publication_date,
            source_type: fields.source_type,
            location: fields.location,
            ..existing
        };
        self.bibliographical_source_repository
            .update(&source)
            .await?;
        Ok(source)
    }

    async fn delete_bibliographical_source(&self, id: Uuid) -> Result<(), RepositoryError> {
        self.bibliographical_source_repository.delete(id).await
    }

    async fn assign_bibliographical_source(
        &self,
        element_id: ElementId,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), BibliographicalSourceServiceError> {
        self.meta_repository
            .set_bibliographical_source(element_id, bibliographical_source_id)
            .await?;
        Ok(())
    }

    async fn assign_bibliographical_source_many(
        &self,
        element_ids: Vec<ElementId>,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), BibliographicalSourceServiceError> {
        for element_id in element_ids {
            self.meta_repository
                .set_bibliographical_source(element_id, bibliographical_source_id)
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
        bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType,
        elements::value_objects::meta::Meta,
        infrastructure::repositories::sqlite::{
            sqlite_bibliographical_source_repository::SqliteBibliographicalSourceRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
        register_scope!(
            injector,
            dyn BibliographicalSourceService,
            DefaultBibliographicalSourceService
        );
        injector
    }

    fn make_fields(location: Option<&str>) -> BibliographicalSourceFields {
        BibliographicalSourceFields {
            title: "test".into(),
            authors: None,
            publication_date: None,
            source_type: BibliographicalSourceType::WebPage,
            location: location.map(|l| l.to_string()),
        }
    }

    async fn make_element(
        meta_repository: &Arc<dyn MetaRepository>,
        parent: Option<ElementId>,
    ) -> ElementId {
        let element_id = ElementId::Folder(Uuid::new_v4());
        meta_repository
            .create_meta(&Meta {
                element_id,
                name: "test".into(),
                parent,
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
        element_id
    }

    #[tokio::test]
    async fn create_or_reuse_source_no_location_always_creates_new() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn BibliographicalSourceService>().await;

        // Act

        let first = service
            .create_or_reuse_bibliographical_source(make_fields(None))
            .await
            .unwrap();
        let second = service
            .create_or_reuse_bibliographical_source(make_fields(None))
            .await
            .unwrap();

        // Assert

        assert_ne!(first.id, second.id);
    }

    #[tokio::test]
    async fn create_or_reuse_source_matching_location_reuses_existing() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn BibliographicalSourceService>().await;
        let first = service
            .create_or_reuse_bibliographical_source(make_fields(Some("https://example.com")))
            .await
            .unwrap();

        // Act

        let second = service
            .create_or_reuse_bibliographical_source(make_fields(Some("https://example.com")))
            .await
            .unwrap();

        // Assert

        assert_eq!(first.id, second.id);
    }

    #[tokio::test]
    async fn assign_source_element_with_no_previous_source_sets_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn BibliographicalSourceService>().await;
        let element_id = make_element(&meta_repository, None).await;
        let source = service
            .create_or_reuse_bibliographical_source(make_fields(None))
            .await
            .unwrap();

        // Act

        service
            .assign_bibliographical_source(element_id, Some(source.id))
            .await
            .unwrap();

        // Assert

        let meta = meta_repository.get_by_id(element_id.id()).await.unwrap();
        assert_eq!(Some(source.id), meta.bibliographical_source_id);
    }

    #[tokio::test]
    async fn assign_source_clear_source_removes_it_from_element() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn BibliographicalSourceService>().await;
        let element_id = make_element(&meta_repository, None).await;
        let source = service
            .create_or_reuse_bibliographical_source(make_fields(None))
            .await
            .unwrap();
        service
            .assign_bibliographical_source(element_id, Some(source.id))
            .await
            .unwrap();

        // Act

        service
            .assign_bibliographical_source(element_id, None)
            .await
            .unwrap();

        // Assert

        let meta = meta_repository.get_by_id(element_id.id()).await.unwrap();
        assert_eq!(None, meta.bibliographical_source_id);
    }

    #[tokio::test]
    async fn assign_source_many_multiple_elements_sets_source_on_each() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn BibliographicalSourceService>().await;
        let first_id = make_element(&meta_repository, None).await;
        let second_id = make_element(&meta_repository, None).await;
        let source = service
            .create_or_reuse_bibliographical_source(make_fields(None))
            .await
            .unwrap();

        // Act

        service
            .assign_bibliographical_source_many(vec![first_id, second_id], Some(source.id))
            .await
            .unwrap();

        // Assert

        let first_meta = meta_repository.get_by_id(first_id.id()).await.unwrap();
        let second_meta = meta_repository.get_by_id(second_id.id()).await.unwrap();
        assert_eq!(Some(source.id), first_meta.bibliographical_source_id);
        assert_eq!(Some(source.id), second_meta.bibliographical_source_id);
    }
}
