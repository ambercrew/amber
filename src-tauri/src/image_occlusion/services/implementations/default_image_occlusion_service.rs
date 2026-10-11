use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;
use crate::image_occlusion::dto::create_image_occlusion_dto::CreateImageOcclusionDto;
use crate::image_occlusion::dto::update_image_occlusion_dto::UpdateImageOcclusionDto;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::image_occlusion::services::image_occlusion_service::{
    ImageOcclusionError, ImageOcclusionService,
};
use crate::image_occlusion::services::occlusion_card_content_builder::{
    OcclusionCardContentBuilder, OcclusionCardContentBuilderError,
};
use crate::image_occlusion::value_objects::occlusion_card_content::OcclusionCardContent;
use crate::sync::store::SyncStore;
use crate::trash::repositories::trash_repository::TrashRepository;
use crate::trash::services::trash_service::TrashService;

const IMAGE_OCCLUSIONS_TABLE: &str = "image_occlusions";

#[derive(ScopeInjectable)]
pub struct DefaultImageOcclusionService {
    image_occlusion_repository: Arc<dyn ImageOcclusionRepository>,
    element_creation_service: Arc<dyn ElementCreationService>,
    meta_repository: Arc<dyn MetaRepository>,
    trash_service: Arc<dyn TrashService>,
    trash_repository: Arc<dyn TrashRepository>,
    occlusion_card_content_builder: Arc<dyn OcclusionCardContentBuilder>,
    sync_store: Arc<dyn SyncStore>,
}

#[async_trait]
impl ImageOcclusionService for DefaultImageOcclusionService {
    async fn find(&self, id: Uuid) -> Result<Option<ImageOcclusion>, ImageOcclusionError> {
        match self.image_occlusion_repository.get_by_id(id).await {
            Ok(occlusion) => Ok(Some(occlusion)),
            Err(RepositoryError::NotFound(_)) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    async fn find_by_source(
        &self,
        parent_id: Uuid,
        image_asset_id: AssetId,
    ) -> Result<Option<ImageOcclusion>, ImageOcclusionError> {
        let id = self
            .image_occlusion_repository
            .find_id_by_source(parent_id, &image_asset_id)
            .await?;
        match id {
            Some(id) => Ok(Some(self.image_occlusion_repository.get_by_id(id).await?)),
            None => Ok(None),
        }
    }

    async fn was_deleted(&self, id: Uuid) -> Result<bool, ImageOcclusionError> {
        Ok(self
            .sync_store
            .is_row_deleted(IMAGE_OCCLUSIONS_TABLE, &id.hyphenated().to_string())
            .await?)
    }

    async fn create(&self, dto: CreateImageOcclusionDto) -> Result<(), ImageOcclusionError> {
        let occlusion = ImageOcclusion {
            id: dto.id,
            name: dto.meta.name,
            image_asset_id: dto.image_asset_id,
            image_width: dto.image_width,
            image_height: dto.image_height,
            shapes: dto.shapes,
            mode: dto.mode,
            parent_id: dto.meta.parent.map(|parent| parent.id()),
        };
        let targets: Vec<_> = occlusion.target_keys().into_iter().enumerate().collect();
        if targets.is_empty() {
            return Err(ImageOcclusionError::NoTargets);
        }
        // Asked before any write, so the database isn't locked while the frontend answers.
        let contents = self.build_contents(&occlusion, &targets).await?;

        self.image_occlusion_repository.create(&occlusion).await?;
        self.create_target_cards(
            &occlusion,
            targets,
            contents,
            dto.meta.parent,
            dto.meta.origin,
        )
        .await
    }

    async fn update(&self, dto: UpdateImageOcclusionDto) -> Result<(), ImageOcclusionError> {
        let existing = self.image_occlusion_repository.get_by_id(dto.id).await?;
        let occlusion = ImageOcclusion {
            shapes: dto.shapes,
            mode: dto.mode,
            ..existing
        };
        let target_keys = occlusion.target_keys();
        if target_keys.is_empty() {
            return self.remove(occlusion.id).await;
        }

        // A trashed card no longer quizzes its target: it's unlinked, and a target still drawn gets a new card.
        let live_ids: HashSet<Uuid> = self
            .image_occlusion_repository
            .get_live_linked_card_ids(occlusion.id)
            .await?
            .into_iter()
            .collect();
        let (live, trashed): (Vec<_>, Vec<_>) = self
            .image_occlusion_repository
            .get_links(occlusion.id)
            .await?
            .into_iter()
            .partition(|link| live_ids.contains(&link.card_id));
        let (links, removed): (Vec<_>, Vec<_>) = live
            .into_iter()
            .partition(|link| target_keys.contains(&link.target_key));
        let new_targets: Vec<_> = target_keys
            .into_iter()
            .enumerate()
            .filter(|(_, key)| !links.iter().any(|link| &link.target_key == key))
            .collect();
        // Asked before any write, so the database isn't locked while the frontend answers.
        let contents = self.build_contents(&occlusion, &new_targets).await?;

        // New cards go next to a sibling (a removed one if none is kept), sharing its lineage and source;
        // with none left, where the occlusion's first cards went.
        let (parent, origin) = match links.first().or(removed.first()) {
            Some(sibling) => {
                let meta = self.meta_repository.get_by_id(sibling.card_id).await?;
                let origin = Origin::Custom {
                    derived_from: meta.derived_from,
                    bibliographical_source_id: meta.bibliographical_source_id,
                };
                (meta.parent, origin)
            }
            None => (
                self.live_parent(occlusion.parent_id).await?,
                Origin::Inherited,
            ),
        };

        self.image_occlusion_repository.update(&occlusion).await?;
        // Created before any unlink, so the occlusion never drops to no cards, which would delete it.
        self.create_target_cards(&occlusion, new_targets, contents, parent, origin)
            .await?;
        // Unlinked too, so a re-added target with the same key gets a fresh card.
        for link in removed.iter().chain(&trashed) {
            self.image_occlusion_repository
                .unlink_card(link.card_id)
                .await?;
        }
        if !removed.is_empty() {
            let removed = removed
                .iter()
                .map(|link| ElementId::Card(link.card_id))
                .collect();
            self.trash_service.trash_many(removed).await?;
        }
        Ok(())
    }
}

impl DefaultImageOcclusionService {
    /// Trashes the occlusion's live cards and unlinks every card; the last unlink deletes the occlusion.
    async fn remove(&self, occlusion_id: Uuid) -> Result<(), ImageOcclusionError> {
        let live = self
            .image_occlusion_repository
            .get_live_linked_card_ids(occlusion_id)
            .await?;
        for link in self
            .image_occlusion_repository
            .get_links(occlusion_id)
            .await?
        {
            self.image_occlusion_repository
                .unlink_card(link.card_id)
                .await?;
        }
        if !live.is_empty() {
            self.trash_service
                .trash_many(live.into_iter().map(ElementId::Card).collect())
                .await?;
        }
        Ok(())
    }

    /// The element the occlusion's cards were created under, unless it's since been trashed or deleted.
    async fn live_parent(
        &self,
        parent_id: Option<Uuid>,
    ) -> Result<Option<ElementId>, ImageOcclusionError> {
        let Some(parent_id) = parent_id else {
            return Ok(None);
        };
        let parent = match self.meta_repository.get_by_id(parent_id).await {
            Ok(meta) => meta.element_id,
            Err(RepositoryError::NotFound(_)) => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        if self.trash_repository.is_trashed(parent).await?
            || !self.trash_repository.has_live_ancestry(parent).await?
        {
            return Ok(None);
        }
        Ok(Some(parent))
    }

    async fn build_contents(
        &self,
        occlusion: &ImageOcclusion,
        targets: &[(usize, String)],
    ) -> Result<HashMap<String, OcclusionCardContent>, ImageOcclusionError> {
        if targets.is_empty() {
            return Ok(HashMap::new());
        }
        let keys: Vec<String> = targets.iter().map(|(_, key)| key.clone()).collect();
        Ok(self
            .occlusion_card_content_builder
            .build(occlusion, &keys)
            .await?)
    }

    /// `index` is the target's position among all of the occlusion's targets, for the card's name.
    async fn create_target_cards(
        &self,
        occlusion: &ImageOcclusion,
        targets: Vec<(usize, String)>,
        mut contents: HashMap<String, OcclusionCardContent>,
        parent: Option<ElementId>,
        origin: Origin,
    ) -> Result<(), ImageOcclusionError> {
        for (index, target_key) in targets {
            let content = contents
                .remove(&target_key)
                .ok_or(OcclusionCardContentBuilderError::InvalidResponse)?;
            let card_id = Uuid::new_v4();
            self.element_creation_service
                .create_card(CreateCardDto {
                    id: card_id,
                    meta: CreateMetaDto {
                        name: format!("{} · {}", occlusion.name, index + 1),
                        parent,
                        origin: origin.clone(),
                    },
                    front: content.front,
                    back: content.back,
                })
                .await?;
            self.image_occlusion_repository
                .link_card(&ImageOcclusionCardLink {
                    card_id,
                    occlusion_id: occlusion.id,
                    target_key,
                })
                .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, injector_scope::InjectorScope, register_scope};

    use crate::{
        assets::value_objects::asset_id::AssetId,
        common::event_manager::{EventManager, MockEventManager},
        elements::{
            entities::folder::Folder,
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
            },
            services::{
                element_index_service::ElementIndexService,
                implementations::{
                    default_element_creation_service::DefaultElementCreationService,
                    default_element_index_service::DefaultElementIndexService,
                    default_priority_service::DefaultPriorityService,
                },
                priority_service::PriorityService,
            },
            value_objects::meta::Meta,
        },
        image_occlusion::value_objects::{
            occlusion_mode::OcclusionMode,
            occlusion_shape::{MaskShape, OcclusionShape, TextShape},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_image_occlusion_repository::SqliteImageOcclusionRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
            sqlite_trash_repository::SqliteTrashRepository,
        },
        infrastructure::value_objects::db_transaction::DbTransaction,
        study::{
            repositories::{
                card_review_repository::CardReviewRepository,
                learning_asset_review_repository::LearningAssetReviewRepository,
                study_profile_repository::StudyProfileRepository,
            },
            services::{
                implementations::default_profile_resolution_service::DefaultProfileResolutionService,
                profile_resolution_service::ProfileResolutionService,
            },
        },
        sync::value_objects::granularity::Granularity,
        test_utils::create_test_injector,
        trash::{
            repositories::trash_repository::TrashRepository,
            services::implementations::default_trash_service::DefaultTrashService,
        },
    };

    use super::*;

    /// Answers like the frontend would, recording which target keys it was asked for.
    #[derive(Default)]
    struct FakeOcclusionCardContentBuilder {
        requested: std::sync::Mutex<Vec<Vec<String>>>,
    }

    #[async_trait]
    impl OcclusionCardContentBuilder for FakeOcclusionCardContentBuilder {
        async fn build(
            &self,
            _occlusion: &ImageOcclusion,
            target_keys: &[String],
        ) -> Result<HashMap<String, OcclusionCardContent>, OcclusionCardContentBuilderError>
        {
            self.requested.lock().unwrap().push(target_keys.to_vec());
            Ok(target_keys
                .iter()
                .map(|key| {
                    let content = OcclusionCardContent {
                        front: format!("front:{key}"),
                        back: format!("back:{key}"),
                    };
                    (key.clone(), content)
                })
                .collect())
        }
    }

    async fn initialize_test_injector() -> Injector {
        initialize_test_injector_with(Arc::new(FakeOcclusionCardContentBuilder::default())).await
    }

    async fn initialize_test_injector_with(
        content_builder: Arc<FakeOcclusionCardContentBuilder>,
    ) -> Injector {
        let mut injector = create_test_injector().await;
        injector.register_singleton::<dyn OcclusionCardContentBuilder>(content_builder);
        let mut event_manager = MockEventManager::new();
        event_manager
            .expect_push()
            .returning(|_, _| Box::pin(async {}));
        injector.register_singleton::<dyn EventManager>(Arc::new(event_manager));
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn ElementIndexService,
            DefaultElementIndexService
        );
        register_scope!(injector, dyn PriorityService, DefaultPriorityService);
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(
            injector,
            dyn CardReviewRepository,
            SqliteCardReviewRepository
        );
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn ProfileResolutionService,
            DefaultProfileResolutionService
        );
        register_scope!(
            injector,
            dyn ElementCreationService,
            DefaultElementCreationService
        );
        register_scope!(injector, dyn TrashRepository, SqliteTrashRepository);
        register_scope!(injector, dyn TrashService, DefaultTrashService);
        register_scope!(
            injector,
            dyn ImageOcclusionRepository,
            SqliteImageOcclusionRepository
        );
        register_scope!(
            injector,
            dyn ImageOcclusionService,
            DefaultImageOcclusionService
        );
        injector
    }

    async fn create_parent_folder(scope: &InjectorScope<'_>) -> ElementId {
        create_folder(scope, None).await
    }

    async fn create_folder(scope: &InjectorScope<'_>, parent: Option<ElementId>) -> ElementId {
        let element_id = ElementId::Folder(Uuid::new_v4());
        let folder = Folder {
            meta: Meta {
                element_id,
                name: "parent".into(),
                parent,
                position: FractionalIndex::default(),
                priority: FractionalIndex::default(),
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
        };
        scope
            .resolve::<dyn FolderRepository>()
            .await
            .create(folder)
            .await
            .unwrap();
        element_id
    }

    fn rect(id: &str, group_id: Option<&str>) -> OcclusionShape {
        OcclusionShape::Rect(MaskShape {
            id: id.into(),
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            rotation: 0.0,
            fill: "#ff0000".into(),
            group_id: group_id.map(Into::into),
        })
    }

    fn create_dto(
        parent: Option<ElementId>,
        shapes: Vec<OcclusionShape>,
    ) -> CreateImageOcclusionDto {
        CreateImageOcclusionDto {
            id: Uuid::new_v4(),
            meta: CreateMetaDto {
                name: "Heart".into(),
                parent,
                origin: Origin::Inherited,
            },
            image_asset_id: AssetId::from_bytes(b"image"),
            image_width: 640,
            image_height: 480,
            shapes,
            mode: OcclusionMode::HideAllGuessOne,
        }
    }

    #[tokio::test]
    async fn create_grouped_and_single_masks_links_one_card_per_target_under_parent() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(
            Some(parent),
            vec![rect("a", None), rect("b", Some("g")), rect("c", Some("g"))],
        );
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;

        // Act

        service.create(dto).await.unwrap();

        // Assert

        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let links = repository.get_links(occlusion_id).await.unwrap();
        let mut keys: Vec<&str> = links.iter().map(|link| link.target_key.as_str()).collect();
        keys.sort();
        assert_eq!(vec!["a", "g"], keys);
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        for link in &links {
            let meta = meta_repository.get_by_id(link.card_id).await.unwrap();
            assert_eq!(Some(parent), meta.parent);
            assert_eq!(Some(parent), meta.derived_from);
        }
    }

    #[tokio::test]
    async fn create_only_text_shapes_returns_no_targets_error() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        let label = OcclusionShape::Text(TextShape {
            id: "t".into(),
            x: 0.1,
            y: 0.1,
            rotation: 0.0,
            text: "Aorta".into(),
            font_size: 0.04,
            color: "#000000".into(),
        });

        // Act

        let actual = service.create(create_dto(None, vec![label])).await;

        // Assert

        assert!(matches!(actual, Err(ImageOcclusionError::NoTargets)));
    }

    #[tokio::test]
    async fn update_removed_and_added_masks_trashes_removed_and_keeps_unchanged_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let before = repository.get_links(occlusion_id).await.unwrap();
        let card_of = |links: &[ImageOcclusionCardLink], key: &str| {
            links
                .iter()
                .find(|link| link.target_key == key)
                .map(|link| link.card_id)
        };
        let card_a = card_of(&before, "a").unwrap();
        let card_b = card_of(&before, "b").unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("b", None), rect("c", None)],
                mode: OcclusionMode::HideOneGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let after = repository.get_links(occlusion_id).await.unwrap();
        assert_eq!(Some(card_b), card_of(&after, "b"));
        let card_c = card_of(&after, "c").unwrap();
        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(card_c)
            .await
            .unwrap();
        assert_eq!(Some(parent), meta.parent);
        let trashed = scope
            .resolve::<dyn TrashService>()
            .await
            .list_trash()
            .await
            .unwrap();
        assert!(
            trashed
                .iter()
                .any(|element| element.element_id.id() == card_a)
        );
        let occlusion = repository.get_by_id(occlusion_id).await.unwrap();
        assert_eq!(OcclusionMode::HideOneGuessOne, occlusion.mode);
    }

    #[tokio::test]
    async fn update_no_masks_left_trashes_cards_and_deletes_occlusion() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let cards: Vec<_> = repository
            .get_links(occlusion_id)
            .await
            .unwrap()
            .into_iter()
            .map(|link| link.card_id)
            .collect();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        assert!(service.find(occlusion_id).await.unwrap().is_none());
        let trashed = scope
            .resolve::<dyn TrashService>()
            .await
            .list_trash()
            .await
            .unwrap();
        for card in cards {
            assert!(
                trashed
                    .iter()
                    .any(|element| element.element_id.id() == card)
            );
        }
    }

    #[tokio::test]
    async fn update_removed_target_re_added_links_new_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let removed_card = repository
            .get_links(occlusion_id)
            .await
            .unwrap()
            .into_iter()
            .find(|link| link.target_key == "a")
            .unwrap()
            .card_id;
        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("b", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", None), rect("b", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let links = repository.get_links(occlusion_id).await.unwrap();
        let re_added = links.iter().find(|link| link.target_key == "a").unwrap();
        assert_ne!(removed_card, re_added.card_id);
        assert_eq!(2, links.len());
    }

    #[tokio::test]
    async fn update_kept_target_with_trashed_card_links_new_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let trashed_card = repository
            .get_links(occlusion_id)
            .await
            .unwrap()
            .into_iter()
            .find(|link| link.target_key == "a")
            .unwrap()
            .card_id;
        scope
            .resolve::<dyn TrashService>()
            .await
            .trash_element(ElementId::Card(trashed_card))
            .await
            .unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", None), rect("b", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let links = repository.get_links(occlusion_id).await.unwrap();
        let relinked = links.iter().find(|link| link.target_key == "a").unwrap();
        assert_ne!(trashed_card, relinked.card_id);
        assert_eq!(2, links.len());
    }

    #[tokio::test]
    async fn update_only_card_trashed_links_new_card_under_occlusions_parent() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let trashed_card = repository.get_links(occlusion_id).await.unwrap()[0].card_id;
        scope
            .resolve::<dyn TrashService>()
            .await
            .trash_element(ElementId::Card(trashed_card))
            .await
            .unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let links = repository.get_links(occlusion_id).await.unwrap();
        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(links[0].card_id)
            .await
            .unwrap();
        assert_eq!(Some(parent), meta.parent);
        assert_eq!(Some(parent), meta.derived_from);
    }

    #[tokio::test]
    async fn update_all_targets_replaced_creates_new_card_under_removed_siblings_parent() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", Some("g")), rect("b", Some("g"))],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let links = repository.get_links(occlusion_id).await.unwrap();
        assert_eq!(1, links.len());
        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(links[0].card_id)
            .await
            .unwrap();
        assert_eq!(Some(parent), meta.parent);
        assert_eq!(Some(parent), meta.derived_from);
    }

    #[tokio::test]
    async fn update_card_under_trashed_ancestor_links_new_card_outside_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let trashed_folder = create_parent_folder(&scope).await;
        scope
            .resolve::<dyn TrashRepository>()
            .await
            .trash(trashed_folder, Utc::now())
            .await
            .unwrap();
        // Arrived from another device after the trash, so only the ancestor carries trashed_at.
        let parent = create_folder(&scope, Some(trashed_folder)).await;
        let dto = create_dto(Some(parent), vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let hidden_card = repository.get_links(occlusion_id).await.unwrap()[0].card_id;

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let links = repository.get_links(occlusion_id).await.unwrap();
        assert_eq!(1, links.len());
        assert_ne!(hidden_card, links[0].card_id);
        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(links[0].card_id)
            .await
            .unwrap();
        assert_eq!(None, meta.parent);
    }

    #[tokio::test]
    async fn delete_permanently_last_card_deletes_occlusion_and_its_image_reference() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None), rect("b", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let trash_service = scope.resolve::<dyn TrashService>().await;
        let cards: Vec<_> = repository
            .get_links(occlusion_id)
            .await
            .unwrap()
            .into_iter()
            .map(|link| ElementId::Card(link.card_id))
            .collect();
        trash_service.trash_many(cards.clone()).await.unwrap();
        trash_service.delete_permanently(cards[0]).await.unwrap();
        let kept_while_a_card_remains = service.find(occlusion_id).await.unwrap();

        // Act

        trash_service.delete_permanently(cards[1]).await.unwrap();

        // Assert

        assert!(kept_while_a_card_remains.is_some());
        assert!(service.find(occlusion_id).await.unwrap().is_none());
        let tx = scope.resolve::<DbTransaction>().await;
        let mut tx = tx.lock().await;
        let references: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM element_assets WHERE element_id = $1")
                .bind(occlusion_id.hyphenated().to_string())
                .fetch_one(tx.as_mut())
                .await
                .unwrap();
        assert_eq!(0, references);
    }

    #[tokio::test]
    async fn was_deleted_after_last_card_deleted_returns_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        // The test database doesn't install sync triggers, which record the tombstone.
        scope
            .resolve::<dyn SyncStore>()
            .await
            .register_table(IMAGE_OCCLUSIONS_TABLE, Granularity::Row, &[])
            .await
            .unwrap();
        let dto = create_dto(None, vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();
        let card = scope
            .resolve::<dyn ImageOcclusionRepository>()
            .await
            .get_links(occlusion_id)
            .await
            .unwrap()[0]
            .card_id;
        let trash_service = scope.resolve::<dyn TrashService>().await;
        trash_service
            .trash_element(ElementId::Card(card))
            .await
            .unwrap();
        trash_service
            .delete_permanently(ElementId::Card(card))
            .await
            .unwrap();

        // Act

        let actual = service.was_deleted(occlusion_id).await.unwrap();

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn was_deleted_unknown_occlusion_returns_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ImageOcclusionService>().await;

        // Act

        let actual = service.was_deleted(Uuid::new_v4()).await.unwrap();

        // Assert

        assert!(!actual);
    }

    #[tokio::test]
    async fn find_by_source_image_already_occluded_in_parent_returns_occlusion() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();

        // Act

        let same_image = service
            .find_by_source(parent.id(), AssetId::from_bytes(b"image"))
            .await
            .unwrap();
        let other_image = service
            .find_by_source(parent.id(), AssetId::from_bytes(b"other"))
            .await
            .unwrap();

        // Assert

        assert_eq!(Some(occlusion_id), same_image.map(|occlusion| occlusion.id));
        assert!(other_image.is_none());
    }

    #[tokio::test]
    async fn find_unknown_id_returns_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ImageOcclusionService>().await;

        // Act

        let actual = service.find(Uuid::new_v4()).await.unwrap();

        // Assert

        assert!(actual.is_none());
    }

    #[tokio::test]
    async fn create_masks_stores_built_content_on_each_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;

        // Act

        service.create(dto).await.unwrap();

        // Assert

        let repository = scope.resolve::<dyn ImageOcclusionRepository>().await;
        let card_id = repository.get_links(occlusion_id).await.unwrap()[0].card_id;
        let card = scope
            .resolve::<dyn CardRepository>()
            .await
            .get_by_id(card_id)
            .await
            .unwrap();
        assert_eq!("front:a", card.front);
        assert_eq!("back:a", card.back);
    }

    #[tokio::test]
    async fn update_added_mask_requests_content_only_for_new_target() {
        // Arrange

        let content_builder = Arc::new(FakeOcclusionCardContentBuilder::default());
        let injector = initialize_test_injector_with(content_builder.clone()).await;
        let scope = injector.start_scope();
        let parent = create_parent_folder(&scope).await;
        let dto = create_dto(Some(parent), vec![rect("a", None)]);
        let occlusion_id = dto.id;
        let service = scope.resolve::<dyn ImageOcclusionService>().await;
        service.create(dto).await.unwrap();

        // Act

        service
            .update(UpdateImageOcclusionDto {
                id: occlusion_id,
                shapes: vec![rect("a", None), rect("b", None)],
                mode: OcclusionMode::HideAllGuessOne,
            })
            .await
            .unwrap();

        // Assert

        let requested = content_builder.requested.lock().unwrap().clone();
        assert_eq!(
            vec![vec!["a".to_string()], vec!["b".to_string()]],
            requested
        );
    }
}
