use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::sync::post_sync_task::{PostSyncTask, PostSyncTaskError};
use crate::trash::repositories::trash_repository::TrashRepository;

/// Restores the "nothing live hangs under a trashed element" invariant after a
/// sync.
///
/// Trashing writes `trashed_at` onto every row of the subtree as it stood on
/// that device. Cell-level last-writer-wins knows nothing of that subtree, so a
/// child created or moved under the element on another device merges in with no
/// `trashed_at` of its own and would resurface as a live orphan under a parent
/// the user cannot see.
///
/// Each such element is trashed into the subtree of the trashed ancestor it
/// hangs from — inheriting its `trashed_at` and never becoming a trash root —
/// so restoring that ancestor brings it back too. The cascade continues through
/// its own descendants.
///
/// The outcome follows from `parent_id` and `trashed_at` alone, both synced, so
/// every device repairs the tree the same way.
#[derive(ScopeInjectable)]
pub struct TrashedSubtreePostSyncTask {
    trash_repository: Arc<dyn TrashRepository>,
}

#[async_trait]
impl PostSyncTask for TrashedSubtreePostSyncTask {
    fn name(&self) -> &'static str {
        "trashed subtree completeness"
    }

    async fn run(&self) -> Result<(), PostSyncTaskError> {
        let trashed = self.trash_repository.trash_descendants_of_trashed().await?;
        if trashed.is_empty() {
            return Ok(());
        }

        log::info!(
            "Post-sync repair: trashing {} element(s) left live under a trashed parent",
            trashed.len()
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, injector_scope::InjectorScope, register_scope};
    use uuid::Uuid;

    use crate::elements::entities::folder::Folder;
    use crate::elements::repositories::folder_repository::FolderRepository;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::meta::Meta;
    use crate::infrastructure::repositories::sqlite::sqlite_folder_repository::SqliteFolderRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_trash_repository::SqliteTrashRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn TrashRepository, SqliteTrashRepository);
        register_scope!(injector, TrashedSubtreePostSyncTask);
        injector
    }

    fn make_folder(name: &str, parent: Option<ElementId>) -> Folder {
        Folder {
            meta: Meta {
                element_id: ElementId::Folder(Uuid::new_v4()),
                name: name.into(),
                parent,
                position: FractionalIndex::default(),
                priority: FractionalIndex::default(),
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
        }
    }

    /// The state a sync leaves behind: the folder was trashed on one device,
    /// the children arrived from another and know nothing about it.
    async fn trashed_folder_with_live_children(
        scope: &InjectorScope<'_>,
        depth: usize,
    ) -> (ElementId, Vec<ElementId>) {
        let folders = scope.resolve::<dyn FolderRepository>().await;
        let trash = scope.resolve::<dyn TrashRepository>().await;

        let root = make_folder("Science", None);
        let root_id = root.meta.element_id;
        folders.create(root).await.unwrap();
        trash
            .trash(root_id, Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap())
            .await
            .unwrap();

        let mut children = Vec::new();
        let mut parent = root_id;
        for level in 0..depth {
            let child = make_folder(&format!("Level {level}"), Some(parent));
            parent = child.meta.element_id;
            children.push(parent);
            folders.create(child).await.unwrap();
        }

        (root_id, children)
    }

    #[tokio::test]
    async fn run_live_child_under_a_trashed_parent_trashes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let (_, children) = trashed_folder_with_live_children(&scope, 1).await;
        let trash = scope.resolve::<dyn TrashRepository>().await;
        let subject = scope.resolve::<TrashedSubtreePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert!(trash.is_trashed(children[0]).await.unwrap());
    }

    #[tokio::test]
    async fn run_live_descendants_several_levels_down_are_all_trashed() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let (_, children) = trashed_folder_with_live_children(&scope, 3).await;
        let trash = scope.resolve::<dyn TrashRepository>().await;
        let subject = scope.resolve::<TrashedSubtreePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        for child in children {
            assert!(trash.is_trashed(child).await.unwrap());
        }
    }

    #[tokio::test]
    async fn run_trashed_descendants_join_the_ancestors_subtree_instead_of_becoming_roots() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let (root_id, _) = trashed_folder_with_live_children(&scope, 2).await;
        let trash = scope.resolve::<dyn TrashRepository>().await;
        let subject = scope.resolve::<TrashedSubtreePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert — one root, with both descendants counted under it, so
        // restoring it brings them back.

        let roots = trash.get_trashed_roots().await.unwrap();
        assert_eq!(1, roots.len());
        assert_eq!(root_id, roots[0].element_id);
        assert_eq!(2, roots[0].descendant_count);
    }

    #[tokio::test]
    async fn run_element_trashed_on_its_own_keeps_its_own_trash_root() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folders = scope.resolve::<dyn FolderRepository>().await;
        let trash = scope.resolve::<dyn TrashRepository>().await;

        let parent = make_folder("Science", None);
        let parent_id = parent.meta.element_id;
        let child = make_folder("Biology", Some(parent_id));
        let child_id = child.meta.element_id;
        folders.create(parent).await.unwrap();
        folders.create(child).await.unwrap();
        trash
            .trash(
                child_id,
                Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap(),
            )
            .await
            .unwrap();
        trash
            .trash(
                parent_id,
                Utc.with_ymd_and_hms(2026, 2, 1, 12, 0, 0).unwrap(),
            )
            .await
            .unwrap();
        let subject = scope.resolve::<TrashedSubtreePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        let roots = trash.get_trashed_roots().await.unwrap();
        assert_eq!(2, roots.len());
    }

    #[tokio::test]
    async fn run_live_tree_without_anything_trashed_is_left_alone() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folders = scope.resolve::<dyn FolderRepository>().await;
        let parent = make_folder("Science", None);
        let parent_id = parent.meta.element_id;
        let child = make_folder("Biology", Some(parent_id));
        let child_id = child.meta.element_id;
        folders.create(parent).await.unwrap();
        folders.create(child).await.unwrap();
        let trash = scope.resolve::<dyn TrashRepository>().await;
        let subject = scope.resolve::<TrashedSubtreePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert!(!trash.is_trashed(parent_id).await.unwrap());
        assert!(!trash.is_trashed(child_id).await.unwrap());
    }
}
