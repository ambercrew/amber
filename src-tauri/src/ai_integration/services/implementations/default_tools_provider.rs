use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ai_integration::services::ai_client_provider::AiClientProvider;
use crate::ai_integration::services::tools_provider::{ToolsProvider, ToolsProviderError};
use crate::ai_integration::tools::app_tools::AppTools;
use crate::ai_integration::tools::create_card::CreateCard;
use crate::ai_integration::tools::create_cloze_card::CreateClozeCard;
use crate::ai_integration::tools::finish_extract::FinishExtract;
use crate::ai_integration::tools::search_documents::SearchDocuments;
use crate::common::services::lexical_json_converter::LexicalJsonConverter;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;

/// What the tools need from the conversation they were given in.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolsContext {
    chat_id: Uuid,
    element_id: Option<ElementId>,
}

#[derive(ScopeInjectable)]
pub struct DefaultToolsProvider {
    ai_client_provider: Arc<dyn AiClientProvider>,
    meta_repository: Arc<dyn MetaRepository>,
    element_creation_service: Arc<dyn ElementCreationService>,
    lexical_json_converter: Arc<dyn LexicalJsonConverter>,
    learning_asset_scheduling_service: Arc<dyn LearningAssetSchedulingService>,
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

        Ok(AppTools::default()
            .tool(CreateCard::new(
                self.element_creation_service.clone(),
                self.lexical_json_converter.clone(),
                element,
            ))
            .tool(CreateClozeCard::new(
                self.element_creation_service.clone(),
                self.lexical_json_converter.clone(),
                element,
            ))
            .tool(FinishExtract::new(
                self.learning_asset_scheduling_service.clone(),
                element,
            ))
            .tool(SearchDocuments::new(
                self.ai_client_provider.clone(),
                context.chat_id,
            )))
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
}
