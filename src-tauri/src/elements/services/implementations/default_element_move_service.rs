use std::sync::Arc;

use async_trait::async_trait;
use fractional_index::FractionalIndex;
use injector_derive::ScopeInjectable;

use crate::elements::dto::move_element_dto::{DropPosition, MoveElementRequestDto};
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_index_service::ElementIndexService;
use crate::elements::services::element_move_error::ElementMoveError;
use crate::elements::services::element_move_service::ElementMoveService;
use crate::elements::value_objects::element_id::ElementId;

#[derive(ScopeInjectable)]
pub struct DefaultElementMoveService {
    meta_repository: Arc<dyn MetaRepository>,
    index_service: Arc<dyn ElementIndexService>,
}

#[async_trait]
impl ElementMoveService for DefaultElementMoveService {
    async fn move_element(&self, dto: MoveElementRequestDto) -> Result<(), ElementMoveError> {
        match self.try_move_element(dto).await {
            Err(ElementMoveError::PositionExhausted) => {
                let target_id = dto.target_id.unwrap();
                let target = self.meta_repository.get_by_id(target_id.id()).await?;
                self.rebalance_children(target.parent).await?;
                self.try_move_element(dto).await
            }
            other => other,
        }
    }
}

impl DefaultElementMoveService {
    async fn try_move_element(&self, dto: MoveElementRequestDto) -> Result<(), ElementMoveError> {
        let new_position = match dto.position {
            DropPosition::Inside => self.index_service.get_new_last_index(dto.target_id).await?,
            DropPosition::Before => {
                self.index_service
                    .get_new_before_index(dto.target_id.unwrap().id())
                    .await?
            }
            DropPosition::After => {
                self.index_service
                    .get_new_after_index(dto.target_id.unwrap().id())
                    .await?
            }
        };

        let parent_id = match dto.position {
            DropPosition::Inside => dto.target_id,
            _ => {
                let parent_meta = self
                    .meta_repository
                    .get_by_id(dto.target_id.unwrap().id())
                    .await?;
                parent_meta.parent
            }
        };

        self.meta_repository
            .move_to(dto.dragged_id, parent_id, new_position)
            .await?;
        Ok(())
    }

    async fn rebalance_children(&self, parent: Option<ElementId>) -> Result<(), ElementMoveError> {
        let children = self.meta_repository.get_children_ordered(parent).await?;
        let mut pos = FractionalIndex::default();
        for child in children {
            self.meta_repository
                .move_to(child.element_id, child.parent, pos.clone())
                .await?;
            pos = FractionalIndex::new_after(&pos);
        }
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
        elements::{
            entities::folder::Folder,
            repositories::{folder_repository::FolderRepository, meta_repository::MetaRepository},
            services::{
                element_index_service::ElementIndexService,
                element_move_service::ElementMoveService,
                implementations::default_element_index_service::DefaultElementIndexService,
            },
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::{
            repositories::sqlite::{
                sqlite_folder_repository::SqliteFolderRepository,
                sqlite_meta_repository::SqliteMetaRepository,
            },
            value_objects::db_transaction::DbTransaction,
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
        register_scope!(injector, dyn ElementMoveService, DefaultElementMoveService);
        injector
    }

    fn make_folder(parent: Option<ElementId>, position: FractionalIndex) -> Folder {
        Folder {
            meta: Meta {
                element_id: ElementId::Folder(Uuid::new_v4()),
                name: "test".into(),
                parent,
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
    async fn move_element_inside_sets_element_as_child_of_target() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ElementMoveService>().await;

        let parent = make_folder(None, FractionalIndex::default());
        let child = make_folder(
            None,
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let parent_id = parent.meta.element_id;
        let child_id = child.meta.element_id;
        folder_repo.create(parent).await.unwrap();
        folder_repo.create(child).await.unwrap();

        // Act

        service
            .move_element(MoveElementRequestDto {
                dragged_id: child_id,
                target_id: Some(parent_id),
                position: DropPosition::Inside,
            })
            .await
            .unwrap();

        // Assert

        let result = meta_repo.get_by_id(child_id.id()).await.unwrap();
        assert_eq!(Some(parent_id), result.parent);
    }

    #[tokio::test]
    async fn move_element_before_places_element_before_target() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ElementMoveService>().await;

        let pos_a = FractionalIndex::default();
        let pos_b = FractionalIndex::new_after(&pos_a);
        let a = make_folder(None, pos_a);
        let b = make_folder(None, pos_b.clone());
        let a_id = a.meta.element_id;
        let b_id = b.meta.element_id;
        folder_repo.create(a).await.unwrap();
        folder_repo.create(b).await.unwrap();

        // Act — move A after B, then move it before B to verify Before works correctly
        service
            .move_element(MoveElementRequestDto {
                dragged_id: a_id,
                target_id: Some(b_id),
                position: DropPosition::After,
            })
            .await
            .unwrap();

        let c = make_folder(None, FractionalIndex::new_after(&pos_b));
        let c_id = c.meta.element_id;
        folder_repo.create(c).await.unwrap();

        service
            .move_element(MoveElementRequestDto {
                dragged_id: a_id,
                target_id: Some(c_id),
                position: DropPosition::Before,
            })
            .await
            .unwrap();

        // Assert — a is before c and after b
        let a_meta = meta_repo.get_by_id(a_id.id()).await.unwrap();
        let b_meta = meta_repo.get_by_id(b_id.id()).await.unwrap();
        let c_meta = meta_repo.get_by_id(c_id.id()).await.unwrap();
        assert!(a_meta.position > b_meta.position);
        assert!(a_meta.position < c_meta.position);
    }

    #[tokio::test]
    async fn move_element_after_places_element_after_target() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ElementMoveService>().await;

        let pos_a = FractionalIndex::default();
        let pos_b = FractionalIndex::new_after(&pos_a);
        let pos_c = FractionalIndex::new_after(&pos_b);
        let a = make_folder(None, pos_a.clone());
        let b = make_folder(None, pos_b);
        let c = make_folder(None, pos_c);
        let a_id = a.meta.element_id;
        let b_id = b.meta.element_id;
        let c_id = c.meta.element_id;
        folder_repo.create(a).await.unwrap();
        folder_repo.create(b).await.unwrap();
        folder_repo.create(c).await.unwrap();

        // Act — move C after A (should land between A and B)

        service
            .move_element(MoveElementRequestDto {
                dragged_id: c_id,
                target_id: Some(a_id),
                position: DropPosition::After,
            })
            .await
            .unwrap();

        // Assert

        let a_meta = meta_repo.get_by_id(a_id.id()).await.unwrap();
        let b_meta = meta_repo.get_by_id(b_id.id()).await.unwrap();
        let c_meta = meta_repo.get_by_id(c_id.id()).await.unwrap();
        assert!(c_meta.position > a_meta.position);
        assert!(c_meta.position < b_meta.position);
    }

    #[tokio::test]
    async fn move_element_before_changes_parent_to_target_parent() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ElementMoveService>().await;

        let parent = make_folder(None, FractionalIndex::default());
        let parent_id = parent.meta.element_id;
        let target = make_folder(Some(parent_id), FractionalIndex::default());
        let target_id = target.meta.element_id;
        let dragged = make_folder(
            None,
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let dragged_id = dragged.meta.element_id;
        folder_repo.create(parent).await.unwrap();
        folder_repo.create(target).await.unwrap();
        folder_repo.create(dragged).await.unwrap();

        // Act — move dragged before target (which is inside parent)

        service
            .move_element(MoveElementRequestDto {
                dragged_id,
                target_id: Some(target_id),
                position: DropPosition::Before,
            })
            .await
            .unwrap();

        // Assert — dragged is now a child of parent

        let result = meta_repo.get_by_id(dragged_id.id()).await.unwrap();
        assert_eq!(Some(parent_id), result.parent);
        let target_meta = meta_repo.get_by_id(target_id.id()).await.unwrap();
        assert!(result.position < target_meta.position);
    }

    #[tokio::test]
    async fn move_element_rebalances_and_succeeds_when_positions_exhausted() {
        // Arrange — create two folders, then exhaust the space between them via direct SQL

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ElementMoveService>().await;
        let tx = scope.resolve::<DbTransaction>().await;

        let first = make_folder(None, FractionalIndex::default());
        let second = make_folder(
            None,
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let third = make_folder(
            None,
            FractionalIndex::new_after(&FractionalIndex::new_after(&FractionalIndex::default())),
        );
        let first_id = first.meta.element_id.id();
        let second_id = second.meta.element_id;
        let third_id = third.meta.element_id;
        folder_repo.create(first).await.unwrap();
        folder_repo.create(second).await.unwrap();
        folder_repo.create(third).await.unwrap();

        // Force first and second to be adjacent with no representable midpoint:
        // Use bytes where new_between would return None.
        // [1, 128] and [2, 128] have a midpoint, so we use bytes that are as close as possible.
        // Easiest: set both to adjacent single-byte values the library considers exhausted.
        // We put first at the byte just before second's position with no room in between
        // by reusing the same bytes for both (equal positions, strict < ensures no sibling found).
        // Instead: place first directly before the gap using a computed adjacent pair.
        let adjacent_before = FractionalIndex::from_bytes(vec![127, 128]).unwrap();
        let adjacent_after = FractionalIndex::from_bytes(vec![128, 128]).unwrap();
        {
            let mut guard = tx.lock().await;
            let tx_ref = guard.as_mut();
            sqlx::query!(
                "UPDATE meta SET position = $1 WHERE element_id = $2",
                adjacent_before.as_bytes(),
                first_id.hyphenated()
            )
            .execute(&mut *tx_ref)
            .await
            .unwrap();
            sqlx::query!(
                "UPDATE meta SET position = $1 WHERE element_id = $2",
                adjacent_after.as_bytes(),
                second_id.id().hyphenated()
            )
            .execute(&mut *tx_ref)
            .await
            .unwrap();
        }

        // Act — move third before second; positions between first and second are exhausted,
        // so the service must rebalance then succeed

        service
            .move_element(MoveElementRequestDto {
                dragged_id: third_id,
                target_id: Some(second_id),
                position: DropPosition::Before,
            })
            .await
            .unwrap();

        // Assert — third ended up before second (parent unchanged: None)

        let third_meta = meta_repo.get_by_id(third_id.id()).await.unwrap();
        let second_meta = meta_repo.get_by_id(second_id.id()).await.unwrap();
        assert_eq!(None, third_meta.parent);
        assert!(third_meta.position < second_meta.position);
    }
}
