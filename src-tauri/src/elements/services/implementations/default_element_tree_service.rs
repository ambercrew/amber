#[cfg(test)]
use crate::elements::value_objects::read_point::ReadPoint;
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::elements::dto::tree_dto::{MetaNodeDto, NodeChildrenDto, NodeDto};
use crate::elements::entities::traits::Element;
use crate::elements::entities::{
    card::Card, extract::Extract, folder::Folder, learning_asset::LearningAsset,
};
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::folder_repository::FolderRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::services::element_tree_service::ElementTreeService;
use crate::elements::value_objects::element_id::ElementId;

#[derive(ScopeInjectable)]
pub struct DefaultElementTreeService {
    folder_repository: Arc<dyn FolderRepository>,
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
    extract_repository: Arc<dyn ExtractRepository>,
    card_repository: Arc<dyn CardRepository>,
}

type ElementMap<V> = HashMap<Option<ElementId>, Vec<V>>;

#[async_trait]
impl ElementTreeService for DefaultElementTreeService {
    async fn get_element_tree(&self) -> Result<Vec<NodeDto>, RepositoryError> {
        let folders = self.folder_repository.get_all().await?;
        let learning_assets = self.learning_asset_repository.get_all().await?;
        let extracts = self.extract_repository.get_all().await?;
        let cards = self.card_repository.get_all().await?;

        let folders_by_parent = group_by_parent(folders, |f| f.meta().parent);
        let learning_assets_by_parent = group_by_parent(learning_assets, |r| r.meta().parent);
        let extracts_by_parent = group_by_parent(extracts, |e| e.meta().parent);
        let cards_by_parent = group_by_parent(cards, |c| c.meta().parent);

        let mut root_nodes: Vec<(fractional_index::FractionalIndex, NodeDto)> = Vec::new();

        for f in folders_by_parent.get(&None).into_iter().flatten() {
            root_nodes.push((
                f.meta().position.clone(),
                build_node(
                    f,
                    Some(f.meta().element_id),
                    &folders_by_parent,
                    &learning_assets_by_parent,
                    &extracts_by_parent,
                    &cards_by_parent,
                ),
            ));
        }
        for r in learning_assets_by_parent.get(&None).into_iter().flatten() {
            root_nodes.push((
                r.meta().position.clone(),
                build_node(
                    r,
                    Some(r.meta().element_id),
                    &folders_by_parent,
                    &learning_assets_by_parent,
                    &extracts_by_parent,
                    &cards_by_parent,
                ),
            ));
        }
        for e in extracts_by_parent.get(&None).into_iter().flatten() {
            root_nodes.push((
                e.meta().position.clone(),
                build_node(
                    e,
                    Some(e.meta().element_id),
                    &folders_by_parent,
                    &learning_assets_by_parent,
                    &extracts_by_parent,
                    &cards_by_parent,
                ),
            ));
        }
        for c in cards_by_parent.get(&None).into_iter().flatten() {
            root_nodes.push((
                c.meta().position.clone(),
                build_node(
                    c,
                    Some(c.meta().element_id),
                    &folders_by_parent,
                    &learning_assets_by_parent,
                    &extracts_by_parent,
                    &cards_by_parent,
                ),
            ));
        }

        root_nodes.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(root_nodes.into_iter().map(|(_, n)| n).collect())
    }
}

fn group_by_parent<V, F>(items: Vec<V>, get_parent: F) -> ElementMap<V>
where
    V: Element,
    F: Fn(&V) -> Option<ElementId>,
{
    let mut map: ElementMap<V> = HashMap::new();
    for item in items {
        map.entry(get_parent(&item)).or_default().push(item);
    }
    for group in map.values_mut() {
        group.sort_by(|a, b| a.meta().position.cmp(&b.meta().position));
    }
    map
}

fn make_meta(element: &impl Element) -> MetaNodeDto {
    let meta = element.meta();
    MetaNodeDto {
        element_id: meta.element_id,
        name: meta.name.clone(),
        position: meta.position.to_string(),
    }
}

fn build_node(
    element: &impl Element,
    parent_key: Option<ElementId>,
    folders_by_parent: &ElementMap<Folder>,
    learning_assets_by_parent: &ElementMap<LearningAsset>,
    extracts_by_parent: &ElementMap<Extract>,
    cards_by_parent: &ElementMap<Card>,
) -> NodeDto {
    NodeDto {
        meta: make_meta(element),
        children: NodeChildrenDto {
            folders: folders_by_parent
                .get(&parent_key)
                .map(|fs| {
                    fs.iter()
                        .map(|f| {
                            build_node(
                                f,
                                Some(f.meta().element_id),
                                folders_by_parent,
                                learning_assets_by_parent,
                                extracts_by_parent,
                                cards_by_parent,
                            )
                        })
                        .collect()
                })
                .unwrap_or_default(),
            learning_assets: learning_assets_by_parent
                .get(&parent_key)
                .map(|rs| {
                    rs.iter()
                        .map(|r| {
                            build_node(
                                r,
                                Some(r.meta().element_id),
                                folders_by_parent,
                                learning_assets_by_parent,
                                extracts_by_parent,
                                cards_by_parent,
                            )
                        })
                        .collect()
                })
                .unwrap_or_default(),
            extracts: extracts_by_parent
                .get(&parent_key)
                .map(|es| {
                    es.iter()
                        .map(|e| {
                            build_node(
                                e,
                                Some(e.meta().element_id),
                                folders_by_parent,
                                learning_assets_by_parent,
                                extracts_by_parent,
                                cards_by_parent,
                            )
                        })
                        .collect()
                })
                .unwrap_or_default(),
            cards: cards_by_parent
                .get(&parent_key)
                .map(|cs| {
                    cs.iter()
                        .map(|c| {
                            build_node(
                                c,
                                Some(c.meta().element_id),
                                folders_by_parent,
                                learning_assets_by_parent,
                                extracts_by_parent,
                                cards_by_parent,
                            )
                        })
                        .collect()
                })
                .unwrap_or_default(),
        },
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
            entities::{
                card::Card, extract::Extract, folder::Folder, learning_asset::LearningAsset,
            },
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            services::element_tree_service::ElementTreeService,
            value_objects::{element_id::ElementId, meta::Meta},
        },
        infrastructure::{
            repositories::sqlite::{
                sqlite_card_repository::SqliteCardRepository,
                sqlite_extract_repository::SqliteExtractRepository,
                sqlite_folder_repository::SqliteFolderRepository,
                sqlite_learning_asset_repository::SqliteLearningAssetRepository,
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
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn ElementTreeService, DefaultElementTreeService);

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

    fn folder_meta() -> Meta {
        make_meta(ElementId::Folder(Uuid::new_v4()))
    }
    fn learning_asset_meta() -> Meta {
        make_meta(ElementId::LearningAsset(Uuid::new_v4()))
    }
    fn extract_meta() -> Meta {
        make_meta(ElementId::Extract(Uuid::new_v4()))
    }
    fn card_meta() -> Meta {
        make_meta(ElementId::Card(Uuid::new_v4()))
    }

    #[tokio::test]
    async fn get_element_tree_empty_database_returns_empty_vec() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert!(actual.is_empty());
    }

    #[tokio::test]
    async fn get_element_tree_single_root_folder_returns_folder_node() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let folder = Folder {
            meta: Meta {
                name: "Science".to_string(),
                ..folder_meta()
            },
        };
        let folder_id = folder.meta.element_id;
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(folder_id, actual[0].meta.element_id);
        assert_eq!("Science", actual[0].meta.name);
    }

    #[tokio::test]
    async fn get_element_tree_nested_folders_returns_correct_hierarchy() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let parent = Folder {
            meta: Meta {
                name: "Science".to_string(),
                ..folder_meta()
            },
        };
        let parent_id = parent.meta.element_id;
        let child = Folder {
            meta: Meta {
                name: "Biology".to_string(),
                parent: Some(parent_id),
                ..folder_meta()
            },
        };
        let child_id = child.meta.element_id;
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        folder_repo.create(parent).await.unwrap();
        folder_repo.create(child).await.unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(parent_id, actual[0].meta.element_id);
        assert_eq!(1, actual[0].children.folders.len());
        assert_eq!(child_id, actual[0].children.folders[0].meta.element_id);
        assert_eq!("Biology", actual[0].children.folders[0].meta.name);
    }

    #[tokio::test]
    async fn get_element_tree_folder_with_learning_asset_extract_and_card_returns_full_chain() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let folder = Folder {
            meta: Meta {
                name: "Science".to_string(),
                ..folder_meta()
            },
        };
        let folder_id = folder.meta.element_id;
        let learning_asset = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Photosynthesis".to_string(),
                parent: Some(folder_id),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        let learning_asset_id = learning_asset.meta.element_id;
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Key passage".to_string(),
                parent: Some(learning_asset_id),
                ..extract_meta()
            },
            content: "Plants convert sunlight".to_string(),
        };
        let extract_id = extract.meta.element_id;
        let card = Card {
            meta: Meta {
                name: "Card 1".to_string(),
                parent: Some(extract_id),
                ..card_meta()
            },
            front: "What do plants convert?".to_string(),
            back: "Sunlight".to_string(),
        };
        let card_id = card.meta.element_id;

        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();
        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(extract)
            .await
            .unwrap();
        scope
            .resolve::<dyn CardRepository>()
            .await
            .create(card)
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        let folder = &actual[0];
        assert_eq!(1, folder.children.learning_assets.len());
        let learning_asset = &folder.children.learning_assets[0];
        assert_eq!(learning_asset_id, learning_asset.meta.element_id);
        assert_eq!(1, learning_asset.children.extracts.len());
        let extract = &learning_asset.children.extracts[0];
        assert_eq!(extract_id, extract.meta.element_id);
        assert_eq!(1, extract.children.cards.len());
        assert_eq!(card_id, extract.children.cards[0].meta.element_id);
    }

    #[tokio::test]
    async fn get_element_tree_multiple_learning_assets_returned_sorted_by_position() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let folder = Folder {
            meta: Meta {
                name: "Science".to_string(),
                ..folder_meta()
            },
        };
        let folder_id = folder.meta.element_id;
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();

        let learning_asset_first = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "First".to_string(),
                parent: Some(folder_id),
                position: FractionalIndex::new_after(&FractionalIndex::default()),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        let learning_asset_second = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Second".to_string(),
                parent: Some(folder_id),
                position: FractionalIndex::new_after(&FractionalIndex::new_after(
                    &FractionalIndex::default(),
                )),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        let learning_asset_first_id = learning_asset_first.meta.element_id;
        let learning_asset_second_id = learning_asset_second.meta.element_id;

        // Insert in reverse position order to verify sorting
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        learning_asset_repo
            .create(learning_asset_second, Vec::new())
            .await
            .unwrap();
        learning_asset_repo
            .create(learning_asset_first, Vec::new())
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        let learning_assets = &actual[0].children.learning_assets;
        assert_eq!(2, learning_assets.len());
        assert_eq!(learning_asset_first_id, learning_assets[0].meta.element_id);
        assert_eq!(learning_asset_second_id, learning_assets[1].meta.element_id);
    }

    #[tokio::test]
    async fn get_element_tree_removed_folder_is_excluded() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let active = Folder {
            meta: Meta {
                name: "Active".to_string(),
                ..folder_meta()
            },
        };
        let removed = Folder {
            meta: Meta {
                name: "Removed".to_string(),
                position: FractionalIndex::new_after(&FractionalIndex::default()),
                ..folder_meta()
            },
        };
        let active_id = active.meta.element_id;
        let removed_id = removed.meta.element_id.id();
        let folder_repo = scope.resolve::<dyn FolderRepository>().await;
        folder_repo.create(active).await.unwrap();
        folder_repo.create(removed).await.unwrap();

        {
            let mut guard = tx.lock().await;
            let tx_ref = guard.as_mut();
            sqlx::query!("DELETE FROM folders WHERE id = $1", removed_id.hyphenated())
                .execute(&mut *tx_ref)
                .await
                .unwrap();
        }

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(active_id, actual[0].meta.element_id);
    }

    #[tokio::test]
    async fn get_element_tree_root_learning_asset_appears_at_root() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let learning_asset = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Orphan LearningAsset".to_string(),
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        let learning_asset_id = learning_asset.meta.element_id;
        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(learning_asset, Vec::new())
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(learning_asset_id, actual[0].meta.element_id);
        assert_eq!("Orphan LearningAsset", actual[0].meta.name);
    }

    #[tokio::test]
    async fn get_element_tree_mixed_root_elements_sorted_by_position() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let pos_first = FractionalIndex::default();
        let pos_second = FractionalIndex::new_after(&pos_first);
        let pos_third = FractionalIndex::new_after(&pos_second);

        let learning_asset = LearningAsset {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "LearningAsset".to_string(),
                position: pos_first,
                ..learning_asset_meta()
            },
            read_point: ReadPoint::default(),
        };
        let folder = Folder {
            meta: Meta {
                name: "Folder".to_string(),
                position: pos_second,
                ..folder_meta()
            },
        };
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Extract".to_string(),
                position: pos_third,
                ..extract_meta()
            },
            content: "Some text".to_string(),
        };
        let learning_asset_id = learning_asset.meta.element_id;
        let folder_id = folder.meta.element_id;
        let extract_id = extract.meta.element_id;

        scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .create(learning_asset, Vec::new())
            .await
            .unwrap();
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(extract)
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        assert_eq!(3, actual.len());
        assert_eq!(learning_asset_id, actual[0].meta.element_id);
        assert_eq!(folder_id, actual[1].meta.element_id);
        assert_eq!(extract_id, actual[2].meta.element_id);
    }

    #[tokio::test]
    async fn get_element_tree_extract_directly_under_folder_returns_in_folder_extracts() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ElementTreeService>().await;

        let folder = Folder {
            meta: Meta {
                name: "Science".to_string(),
                ..folder_meta()
            },
        };
        let folder_id = folder.meta.element_id;
        let extract = Extract {
            interval_multiplier: 1.2,
            meta: Meta {
                name: "Direct extract".to_string(),
                parent: Some(folder_id),
                ..extract_meta()
            },
            content: "Some text".to_string(),
        };
        let extract_id = extract.meta.element_id;
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(extract)
            .await
            .unwrap();

        // Act

        let actual = service.get_element_tree().await.unwrap();

        // Assert

        let folder = &actual[0];
        assert!(folder.children.learning_assets.is_empty());
        assert_eq!(1, folder.children.extracts.len());
        assert_eq!(extract_id, folder.children.extracts[0].meta.element_id);
    }
}
