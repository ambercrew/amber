use std::sync::Arc;

use async_trait::async_trait;
use fractional_index::FractionalIndex;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_index_service::ElementIndexService;
use crate::elements::services::element_move_error::ElementMoveError;
use crate::elements::value_objects::element_id::ElementId;

#[derive(ScopeInjectable)]
pub struct DefaultElementIndexService {
    meta_repository: Arc<dyn MetaRepository>,
}

#[async_trait]
impl ElementIndexService for DefaultElementIndexService {
    async fn get_new_last_index(
        &self,
        parent: Option<ElementId>,
    ) -> Result<FractionalIndex, ElementMoveError> {
        let last = self.meta_repository.get_last_position(parent).await?;
        Ok(last
            .map(|p| FractionalIndex::new_after(&p))
            .unwrap_or_default())
    }

    async fn get_new_before_index(&self, id: Uuid) -> Result<FractionalIndex, ElementMoveError> {
        let current = self.meta_repository.get_by_id(id).await?;
        let previous = self.meta_repository.get_previous_sibling(&current).await?;

        let pos = match previous {
            Some(previous) => FractionalIndex::new_between(&previous.position, &current.position)
                .ok_or(ElementMoveError::PositionExhausted)?,
            None => FractionalIndex::new_before(&current.position),
        };

        Ok(pos)
    }

    async fn get_new_after_index(&self, id: Uuid) -> Result<FractionalIndex, ElementMoveError> {
        let current = self.meta_repository.get_by_id(id).await?;
        let next = self.meta_repository.get_next_sibling(&current).await?;

        let pos = match next {
            Some(next) => FractionalIndex::new_between(&current.position, &next.position)
                .ok_or(ElementMoveError::PositionExhausted)?,
            None => FractionalIndex::new_after(&current.position),
        };

        Ok(pos)
    }
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::{
            entities::folder::Folder,
            repositories::{folder_repository::FolderRepository, meta_repository::MetaRepository},
            services::element_index_service::ElementIndexService,
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn ElementIndexService,
            DefaultElementIndexService
        );
        injector
    }

    fn make_folder(position: FractionalIndex) -> Folder {
        Folder {
            meta: Meta {
                element_id: ElementId::Folder(Uuid::new_v4()),
                name: "test".into(),
                name_source: NameSource::Manual,
                parent: None,
                position,
                priority: FractionalIndex::default(),
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
        }
    }

    #[tokio::test]
    async fn get_new_last_index_empty_parent_returns_default() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;

        // Act

        let actual = service.get_new_last_index(None).await.unwrap();

        // Assert

        assert_eq!(FractionalIndex::default(), actual);
    }

    #[tokio::test]
    async fn get_new_last_index_with_children_returns_after_last() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;

        let last_pos = FractionalIndex::new_after(&FractionalIndex::default());
        let folder = make_folder(last_pos.clone());
        folder_repo.create(folder).await.unwrap();

        // Act

        let actual = service.get_new_last_index(None).await.unwrap();

        // Assert

        assert!(actual > last_pos);
    }

    #[tokio::test]
    async fn get_new_before_index_no_previous_returns_position_before_target() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;

        let folder = make_folder(FractionalIndex::default());
        let folder_id = folder.meta.element_id;
        let folder_pos = folder.meta.position.clone();
        folder_repo.create(folder).await.unwrap();

        // Act

        let actual = service.get_new_before_index(folder_id.id()).await.unwrap();

        // Assert

        assert!(actual < folder_pos);
    }

    #[tokio::test]
    async fn get_new_before_index_with_previous_returns_between_siblings() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;

        let pos_first = FractionalIndex::default();
        let pos_second = FractionalIndex::new_after(&pos_first);
        let first = make_folder(pos_first.clone());
        let second = make_folder(pos_second.clone());
        let second_id = second.meta.element_id;
        folder_repo.create(first).await.unwrap();
        folder_repo.create(second).await.unwrap();

        // Act

        let actual = service.get_new_before_index(second_id.id()).await.unwrap();

        // Assert

        assert!(actual > pos_first);
        assert!(actual < pos_second);
    }

    #[tokio::test]
    async fn get_new_after_index_no_next_returns_position_after_target() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;

        let folder = make_folder(FractionalIndex::default());
        let folder_id = folder.meta.element_id;
        let folder_pos = folder.meta.position.clone();
        folder_repo.create(folder).await.unwrap();

        // Act

        let actual = service.get_new_after_index(folder_id.id()).await.unwrap();

        // Assert

        assert!(actual > folder_pos);
    }

    #[tokio::test]
    async fn get_new_after_index_with_next_returns_between_siblings() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementIndexService>().await;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;

        let pos_first = FractionalIndex::default();
        let pos_second = FractionalIndex::new_after(&pos_first);
        let first = make_folder(pos_first.clone());
        let second = make_folder(pos_second.clone());
        let first_id = first.meta.element_id;
        folder_repo.create(first).await.unwrap();
        folder_repo.create(second).await.unwrap();

        // Act

        let actual = service.get_new_after_index(first_id.id()).await.unwrap();

        // Assert

        assert!(actual > pos_first);
        assert!(actual < pos_second);
    }
}
