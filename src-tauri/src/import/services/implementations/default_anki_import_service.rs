use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::assets::services::asset_service::AssetService;
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_folder_dto::CreateFolderDto;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;
use crate::image_occlusion::dto::create_image_occlusion_dto::CreateImageOcclusionDto;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionService;
use crate::import::anki::entities::anki_occlusion::AnkiOcclusion;
use crate::import::anki::extraction::extract_anki;
use crate::import::services::anki_import_service::{AnkiImportError, AnkiImportService};
use crate::import::services::imported_html_converter::{
    ImportedHtmlConverter, ImportedHtmlConverterError,
};

#[derive(ScopeInjectable)]
pub struct DefaultAnkiImportService {
    element_creation_service: Arc<dyn ElementCreationService>,
    meta_repository: Arc<dyn MetaRepository>,
    asset_service: Arc<dyn AssetService>,
    imported_html_converter: Arc<dyn ImportedHtmlConverter>,
    image_occlusion_service: Arc<dyn ImageOcclusionService>,
    image_occlusion_repository: Arc<dyn ImageOcclusionRepository>,
}

#[async_trait]
impl AnkiImportService for DefaultAnkiImportService {
    async fn import_package(
        &self,
        bytes: Vec<u8>,
        parent: Option<ElementId>,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<Option<ElementId>, AnkiImportError> {
        let extraction = tokio::task::spawn_blocking(move || extract_anki(bytes)).await??;

        // Converted before any write, so the database isn't locked while the frontend answers.
        let htmls = extraction
            .decks
            .iter()
            .flat_map(|deck| &deck.cards)
            .flat_map(|card| [card.front.clone(), card.back.clone()])
            .collect();
        let mut contents = self
            .imported_html_converter
            .convert(htmls)
            .await?
            .into_iter();
        let mut next_content = || {
            contents
                .next()
                .ok_or(ImportedHtmlConverterError::InvalidResponse)
        };

        for image in &extraction.images {
            self.asset_service.store(image).await?;
        }

        // Every element comes from the package itself, not from the folder holding it.
        let origin = || Origin::Custom {
            derived_from: None,
            bibliographical_source_id,
        };
        let mut folders: HashMap<Vec<String>, ElementId> = HashMap::new();
        let mut first_root = None;

        for deck in extraction.decks {
            let mut deck_parent = parent;
            for depth in 1..=deck.path.len() {
                let path = &deck.path[..depth];
                if let Some(folder) = folders.get(path) {
                    deck_parent = Some(*folder);
                    continue;
                }
                let id = Uuid::new_v4();
                self.element_creation_service
                    .create_folder(CreateFolderDto {
                        id,
                        meta: CreateMetaDto {
                            name: Some(path[depth - 1].clone()),
                            parent: deck_parent,
                            origin: origin(),
                        },
                    })
                    .await?;
                let folder = ElementId::Folder(id);
                folders.insert(path.to_vec(), folder);
                if depth == 1 {
                    first_root.get_or_insert(folder);
                }
                deck_parent = Some(folder);
            }

            for card in deck.cards {
                let id = Uuid::new_v4();
                self.element_creation_service
                    .create_card(CreateCardDto {
                        id,
                        meta: CreateMetaDto {
                            name: None,
                            parent: deck_parent,
                            origin: origin(),
                        },
                        front: next_content()?,
                        back: next_content()?,
                    })
                    .await?;
                if !card.tags.is_empty() {
                    self.meta_repository
                        .add_tags(ElementId::Card(id), card.tags)
                        .await?;
                }
            }

            for occlusion in deck.image_occlusions {
                self.create_occlusion(occlusion, deck_parent, origin())
                    .await?;
            }
        }
        Ok(first_root)
    }
}

impl DefaultAnkiImportService {
    async fn create_occlusion(
        &self,
        occlusion: AnkiOcclusion,
        parent: Option<ElementId>,
        origin: Origin,
    ) -> Result<(), AnkiImportError> {
        let id = Uuid::new_v4();
        self.image_occlusion_service
            .create(CreateImageOcclusionDto {
                id,
                meta: CreateMetaDto {
                    name: Some(occlusion.name),
                    parent,
                    origin,
                },
                image_asset_id: occlusion.image_asset_id,
                image_width: occlusion.image_width,
                image_height: occlusion.image_height,
                shapes: occlusion.shapes,
                mode: occlusion.mode,
            })
            .await?;
        for link in self.image_occlusion_repository.get_links(id).await? {
            if !occlusion.tags.is_empty() {
                self.meta_repository
                    .add_tags(ElementId::Card(link.card_id), occlusion.tags.clone())
                    .await?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::assets::services::asset_service::MockAssetService;
    use crate::elements::repositories::meta_repository::MockMetaRepository;
    use crate::elements::services::element_creation_service::{
        ElementCreationError, MockElementCreationService,
    };
    use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;
    use crate::image_occlusion::repositories::image_occlusion_repository::MockImageOcclusionRepository;
    use crate::image_occlusion::services::image_occlusion_service::MockImageOcclusionService;
    use crate::import::anki::fixtures::{enhanced_occlusion_package, legacy_package};
    use crate::import::services::imported_html_converter::MockImportedHtmlConverter;

    use super::*;

    /// Each folder created as (name, parent, id), and each card as (parent, front).
    #[derive(Default)]
    struct Created {
        folders: Vec<(String, Option<ElementId>, ElementId)>,
        cards: Vec<(Option<ElementId>, String)>,
    }

    fn recording_creation_service(created: Arc<Mutex<Created>>) -> MockElementCreationService {
        let mut mock = MockElementCreationService::new();
        let folders = created.clone();
        mock.expect_create_folder().returning(move |dto| {
            let name = dto.meta.name.clone().unwrap();
            let folder = ElementId::Folder(dto.id);
            folders
                .lock()
                .unwrap()
                .folders
                .push((name, dto.meta.parent, folder));
            Box::pin(async { Ok::<(), ElementCreationError>(()) })
        });
        mock.expect_create_card().returning(move |dto| {
            created
                .lock()
                .unwrap()
                .cards
                .push((dto.meta.parent, dto.front.clone()));
            Box::pin(async { Ok(()) })
        });
        mock
    }

    /// Prefixes each fragment, standing in for the frontend's Lexical conversion.
    fn prefixing_converter() -> MockImportedHtmlConverter {
        let mut mock = MockImportedHtmlConverter::new();
        mock.expect_convert().returning(|htmls| {
            let contents = htmls.iter().map(|html| format!("lexical {html}")).collect();
            Box::pin(async move { Ok(contents) })
        });
        mock
    }

    fn storing_asset_service() -> MockAssetService {
        let mut mock = MockAssetService::new();
        mock.expect_store()
            .returning(|_| Box::pin(async { Ok(()) }));
        mock
    }

    /// Each element tagged, with its tags.
    type Tagged = Arc<Mutex<Vec<(ElementId, Vec<String>)>>>;

    fn tag_recorder(tagged: Tagged) -> MockMetaRepository {
        let mut mock = MockMetaRepository::new();
        mock.expect_add_tags().returning(move |id, tags| {
            tagged.lock().unwrap().push((id, tags));
            Box::pin(async { Ok(()) })
        });
        mock
    }

    #[tokio::test]
    async fn import_package_subdecks_nest_with_converted_cards() {
        // Arrange

        let created = Arc::new(Mutex::new(Created::default()));
        let tagged = Arc::new(Mutex::new(Vec::new()));
        let service = DefaultAnkiImportService {
            element_creation_service: Arc::new(recording_creation_service(created.clone())),
            meta_repository: Arc::new(tag_recorder(tagged.clone())),
            asset_service: Arc::new(storing_asset_service()),
            imported_html_converter: Arc::new(prefixing_converter()),
            image_occlusion_service: Arc::new(MockImageOcclusionService::new()),
            image_occlusion_repository: Arc::new(MockImageOcclusionRepository::new()),
        };

        // Act

        let root = service
            .import_package(legacy_package(), None, None)
            .await
            .unwrap();

        // Assert

        let created = created.lock().unwrap();
        let [
            (spanish, None, spanish_id),
            (verbs, Some(verbs_parent), verbs_id),
        ] = created.folders.as_slice()
        else {
            panic!("expected Spanish and its Verbs subdeck");
        };
        assert_eq!(("Spanish", "Verbs"), (spanish.as_str(), verbs.as_str()));
        assert_eq!(spanish_id, verbs_parent);
        assert_eq!(Some(*spanish_id), root);
        assert_eq!(3, created.cards.len());
        assert!(
            created
                .cards
                .iter()
                .all(|(parent, _)| *parent == Some(*verbs_id))
        );
        assert_eq!("lexical hablar", created.cards[0].1);
        assert_eq!(1, tagged.lock().unwrap().len());
    }

    #[tokio::test]
    async fn import_package_image_occlusion_created_in_deck_folder_with_tagged_cards() {
        // Arrange

        let created = Arc::new(Mutex::new(Created::default()));
        let occlusion_meta = Arc::new(Mutex::new(None));
        let mut image_occlusion_service = MockImageOcclusionService::new();
        let recorded_meta = occlusion_meta.clone();
        image_occlusion_service
            .expect_create()
            .times(1)
            .returning(move |dto| {
                *recorded_meta.lock().unwrap() = Some((dto.meta.parent, dto.meta.name));
                Box::pin(async { Ok(()) })
            });
        let card_ids = [Uuid::new_v4(), Uuid::new_v4()];
        let mut image_occlusion_repository = MockImageOcclusionRepository::new();
        image_occlusion_repository
            .expect_get_links()
            .returning(move |occlusion_id| {
                let links = card_ids
                    .iter()
                    .map(|card_id| ImageOcclusionCardLink {
                        card_id: *card_id,
                        occlusion_id,
                        target_key: "abc-ao-1".to_string(),
                    })
                    .collect();
                Box::pin(async move { Ok(links) })
            });
        let tagged = Arc::new(Mutex::new(Vec::new()));
        let mut asset_service = MockAssetService::new();
        asset_service
            .expect_store()
            .times(1)
            .returning(|_| Box::pin(async { Ok(()) }));
        let service = DefaultAnkiImportService {
            element_creation_service: Arc::new(recording_creation_service(created.clone())),
            meta_repository: Arc::new(tag_recorder(tagged.clone())),
            asset_service: Arc::new(asset_service),
            imported_html_converter: Arc::new(prefixing_converter()),
            image_occlusion_service: Arc::new(image_occlusion_service),
            image_occlusion_repository: Arc::new(image_occlusion_repository),
        };
        let (package, _) = enhanced_occlusion_package();

        // Act

        let root = service.import_package(package, None, None).await.unwrap();

        // Assert

        assert!(created.lock().unwrap().cards.is_empty());
        assert_eq!(
            Some((root, Some("Row reduction".to_string()))),
            occlusion_meta.lock().unwrap().clone()
        );
        let expected: Vec<_> = card_ids
            .iter()
            .map(|id| (ElementId::Card(*id), vec!["algebra".to_string()]))
            .collect();
        assert_eq!(expected, *tagged.lock().unwrap());
    }
}
