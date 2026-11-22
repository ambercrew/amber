use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ai_integration::services::document_search_service::DocumentSearchService;
use crate::ai_integration::services::tools_provider::{ToolsProvider, ToolsProviderError};
use crate::ai_integration::tools::app_tools::AppTools;
use crate::ai_integration::tools::clear_leech::ClearLeech;
use crate::ai_integration::tools::create_card::CreateCard;
use crate::ai_integration::tools::create_cloze_card::CreateClozeCard;
use crate::ai_integration::tools::finish_extract::FinishExtract;
use crate::ai_integration::tools::search_documents::SearchDocuments;
use crate::ai_integration::tools::search_open_element::SearchOpenElement;
use crate::ai_integration::tools::update_card::{CardRewriter, UpdateCard};
use crate::ai_integration::tools::update_cloze_card::UpdateClozeCard;
use crate::common::event_manager::EventManager;
use crate::common::services::lexical_json_converter::LexicalJsonConverter;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_content_service::ElementContentService;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::value_objects::element_id::ElementId;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::search::services::content_search_service::ContentSearchService;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
use crate::study::services::leech_service::LeechService;

/// What the tools need from the conversation they were given in.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolsContext {
    chat_id: Uuid,
    element_id: Option<ElementId>,
}

#[derive(ScopeInjectable)]
pub struct DefaultToolsProvider {
    document_search_service: Arc<dyn DocumentSearchService>,
    meta_repository: Arc<dyn MetaRepository>,
    element_creation_service: Arc<dyn ElementCreationService>,
    lexical_json_converter: Arc<dyn LexicalJsonConverter>,
    learning_asset_scheduling_service: Arc<dyn LearningAssetSchedulingService>,
    content_search_service: Arc<dyn ContentSearchService>,
    element_content_service: Arc<dyn ElementContentService>,
    leech_service: Arc<dyn LeechService>,
    event_manager: Arc<dyn EventManager>,
    image_occlusion_repository: Arc<dyn ImageOcclusionRepository>,
}

#[async_trait]
impl ToolsProvider for DefaultToolsProvider {
    fn capture_context(&self, chat_id: Uuid, element_id: Option<ElementId>) -> Value {
        serde_json::to_value(ToolsContext {
            chat_id,
            element_id,
        })
        .unwrap_or_default()
    }

    async fn get_tools(&self, context: &Value) -> Result<AppTools, ToolsProviderError> {
        let context: ToolsContext = serde_json::from_value(context.clone())?;

        let element = existing_element(self.meta_repository.as_ref(), context.element_id).await?;
        let new_card_parent = new_card_parent(self.meta_repository.as_ref(), element).await?;
        let rewritable_card =
            rewritable_card(self.image_occlusion_repository.as_ref(), element).await?;
        let rewriter = || {
            CardRewriter::new(
                self.element_content_service.clone(),
                self.event_manager.clone(),
                self.lexical_json_converter.clone(),
                rewritable_card,
            )
        };

        Ok(AppTools::default()
            .tool(CreateCard::new(
                self.element_creation_service.clone(),
                self.lexical_json_converter.clone(),
                new_card_parent,
            ))
            .tool(CreateClozeCard::new(
                self.element_creation_service.clone(),
                self.lexical_json_converter.clone(),
                new_card_parent,
            ))
            .tool(UpdateCard::new(rewriter()))
            .tool(UpdateClozeCard::new(rewriter()))
            .tool(
                ClearLeech::new(
                    self.leech_service.clone(),
                    self.event_manager.clone(),
                    element,
                )
                .await?,
            )
            .tool(FinishExtract::new(
                self.learning_asset_scheduling_service.clone(),
                element,
            ))
            .tool(SearchDocuments::new(
                self.document_search_service.clone(),
                context.chat_id,
            ))
            .tool(SearchOpenElement::new(self.content_search_service.clone(), element).await?))
    }
}

/// Where new cards go: in the open element, or beside it when it's a card, as when splitting a card up.
async fn new_card_parent(
    meta_repository: &dyn MetaRepository,
    element: Option<ElementId>,
) -> Result<Option<ElementId>, ToolsProviderError> {
    match element {
        Some(ElementId::Card(id)) => Ok(meta_repository.get_by_id(id).await?.parent),
        other => Ok(other),
    }
}

/// The open card, unless an occlusion builds it from its image and masks, which a text rewrite would replace.
async fn rewritable_card(
    image_occlusion_repository: &dyn ImageOcclusionRepository,
    element: Option<ElementId>,
) -> Result<Option<ElementId>, ToolsProviderError> {
    match element {
        Some(ElementId::Card(id)) if !image_occlusion_repository.is_card_linked(id).await? => {
            Ok(element)
        }
        _ => Ok(None),
    }
}

/// An element deleted since the context was captured leaves the tools without one.
async fn existing_element(
    meta_repository: &dyn MetaRepository,
    element_id: Option<ElementId>,
) -> Result<Option<ElementId>, ToolsProviderError> {
    match element_id {
        Some(element_id) if meta_repository.exists(element_id).await? => Ok(Some(element_id)),
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::value_objects::meta::Meta,
        infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository,
        test_utils::create_test_injector,
    };

    use super::*;
    use crate::image_occlusion::repositories::image_occlusion_repository::MockImageOcclusionRepository;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;

        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);

        injector
    }

    fn make_meta(element_id: ElementId) -> Meta {
        Meta {
            element_id,
            name: "My Learning Asset".into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            derived_from: None,
            study_profile_id: None,
            bibliographical_source_id: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn existing_element_existing_element_returned_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;

        let element_id = ElementId::LearningAsset(Uuid::new_v4());
        meta_repository
            .create_meta(&make_meta(element_id))
            .await
            .unwrap();

        // Act

        let actual = existing_element(meta_repository.as_ref(), Some(element_id))
            .await
            .unwrap();

        // Assert

        assert_eq!(Some(element_id), actual);
    }

    #[tokio::test]
    async fn existing_element_deleted_element_returned_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;

        let element_id = ElementId::LearningAsset(Uuid::new_v4());

        // Act

        let actual = existing_element(meta_repository.as_ref(), Some(element_id))
            .await
            .unwrap();

        // Assert

        assert_eq!(None, actual);
    }

    #[tokio::test]
    async fn new_card_parent_open_card_returns_its_parent() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let extract = ElementId::Extract(Uuid::new_v4());
        let card = ElementId::Card(Uuid::new_v4());
        meta_repository
            .create_meta(&make_meta(extract))
            .await
            .unwrap();
        meta_repository
            .create_meta(&Meta {
                parent: Some(extract),
                ..make_meta(card)
            })
            .await
            .unwrap();

        // Act

        let actual = new_card_parent(meta_repository.as_ref(), Some(card))
            .await
            .unwrap();

        // Assert

        assert_eq!(Some(extract), actual);
    }

    #[tokio::test]
    async fn rewritable_card_occlusion_card_returns_none() {
        // Arrange

        let mut repository = MockImageOcclusionRepository::new();
        repository
            .expect_is_card_linked()
            .returning(|_| Box::pin(async { Ok(true) }));
        let card = ElementId::Card(Uuid::new_v4());

        // Act

        let actual = rewritable_card(&repository, Some(card)).await.unwrap();

        // Assert

        assert_eq!(None, actual);
    }

    #[tokio::test]
    async fn rewritable_card_text_card_returns_the_card() {
        // Arrange

        let mut repository = MockImageOcclusionRepository::new();
        repository
            .expect_is_card_linked()
            .returning(|_| Box::pin(async { Ok(false) }));
        let card = ElementId::Card(Uuid::new_v4());

        // Act

        let actual = rewritable_card(&repository, Some(card)).await.unwrap();

        // Assert

        assert_eq!(Some(card), actual);
    }

    #[tokio::test]
    async fn new_card_parent_open_extract_returns_the_extract() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let extract = ElementId::Extract(Uuid::new_v4());

        // Act

        let actual = new_card_parent(meta_repository.as_ref(), Some(extract))
            .await
            .unwrap();

        // Assert

        assert_eq!(Some(extract), actual);
    }
}
