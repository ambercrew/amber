use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::prompts::CREATE_CARD_DESCRIPTION;
use crate::common::services::lexical_json_converter::{
    LexicalJsonConverter, LexicalJsonConverterError,
};
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::services::element_creation_service::{
    ElementCreationError, ElementCreationService,
};
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;

const MAX_NAME_LEN: usize = 60;

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
pub struct CreateCardArgs {
    #[schemars(description = "The text shown on the front of the card (the question or prompt).")]
    pub front: String,
    #[schemars(description = "The text shown on the back of the card (the answer)")]
    pub back: String,
}

#[derive(Error, Debug)]
pub enum CreateCardError {
    #[error("Failed to create the card")]
    Creation(#[from] ElementCreationError),
    #[error("Failed to convert the card content")]
    Conversion(#[from] LexicalJsonConverterError),
}

pub struct CreateCard {
    element_creation_service: Arc<dyn ElementCreationService>,
    lexical_json_converter: Arc<dyn LexicalJsonConverter>,
    parent: Option<ElementId>,
}

impl CreateCard {
    pub fn new(
        element_creation_service: Arc<dyn ElementCreationService>,
        lexical_json_converter: Arc<dyn LexicalJsonConverter>,
        parent: Option<ElementId>,
    ) -> Self {
        Self {
            element_creation_service,
            lexical_json_converter,
            parent,
        }
    }
}

impl Tool for CreateCard {
    const NAME: &'static str = "create_card";

    type Error = CreateCardError;
    type Args = CreateCardArgs;
    type Output = String;

    fn description(&self) -> String {
        CREATE_CARD_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(CreateCardArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let (front, back) = tokio::try_join!(
            self.lexical_json_converter.convert_markdown(&args.front),
            self.lexical_json_converter.convert_markdown(&args.back),
        )?;

        let dto = CreateCardDto {
            id: Uuid::new_v4(),
            meta: CreateMetaDto {
                name: card_name(&args.front),
                parent: self.parent,
                origin: Origin::Inherited,
            },
            front,
            back,
        };

        self.element_creation_service.create_card(dto).await?;

        Ok("Card created.".to_string())
    }
}

/// Derives a short element name from the front text.
fn card_name(front: &str) -> String {
    let trimmed = front.trim();

    if trimmed.chars().count() > MAX_NAME_LEN {
        format!(
            "{}…",
            trimmed.chars().take(MAX_NAME_LEN).collect::<String>()
        )
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use injector::{injector::Injector, register_scope};

    use crate::{
        bibliographical_sources::{
            entities::bibliographical_source::BibliographicalSource,
            repositories::bibliographical_source_repository::BibliographicalSourceRepository,
            value_objects::bibliographical_source_type::BibliographicalSourceType,
        },
        elements::{
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                folder_repository::FolderRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            services::implementations::{
                default_element_creation_service::DefaultElementCreationService,
                default_element_index_service::DefaultElementIndexService,
                default_priority_service::DefaultPriorityService,
            },
            services::{
                element_index_service::ElementIndexService, priority_service::PriorityService,
            },
        },
        infrastructure::repositories::sqlite::{
            sqlite_bibliographical_source_repository::SqliteBibliographicalSourceRepository,
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
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
        test_utils::create_test_injector,
    };

    use super::*;

    /// Echoes the Markdown back unchanged, standing in for the real
    /// frontend conversion so tests can assert on the Markdown this tool
    /// produces.
    struct EchoLexicalJsonConverter;

    #[async_trait]
    impl LexicalJsonConverter for EchoLexicalJsonConverter {
        async fn convert_markdown(
            &self,
            markdown: &str,
        ) -> Result<String, LexicalJsonConverterError> {
            Ok(markdown.to_string())
        }
    }

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
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
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

        injector
    }

    #[tokio::test]
    async fn call_plain_front_and_back_created_card_with_markdown_content() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_creation_service = scope.resolve::<dyn ElementCreationService>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;

        let tool = CreateCard::new(
            element_creation_service,
            Arc::new(EchoLexicalJsonConverter),
            None,
        );

        // Act

        let actual = tool
            .call(
                &mut ToolContext::default(),
                CreateCardArgs {
                    front: "What is the capital of France?".to_string(),
                    back: "Paris".to_string(),
                },
            )
            .await
            .unwrap();

        // Assert

        assert_eq!("Card created.", actual);
        let cards = card_repository.get_all().await.unwrap();
        assert_eq!(1, cards.len());
        assert_eq!("What is the capital of France?", cards[0].meta.name);
        assert_eq!("What is the capital of France?", cards[0].front);
        assert_eq!("Paris", cards[0].back);
    }

    #[tokio::test]
    async fn call_inherited_origin_copies_parent_lineage_and_bibliographical_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let element_creation_service = scope.resolve::<dyn ElementCreationService>().await;
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let bibliographical_source_repository =
            scope.resolve::<dyn BibliographicalSourceRepository>().await;

        let bibliographical_source_id = Uuid::new_v4();
        let now = chrono::Utc::now();
        bibliographical_source_repository
            .create(&BibliographicalSource {
                id: bibliographical_source_id,
                title: "Test source".to_string(),
                authors: None,
                publication_date: None,
                source_type: BibliographicalSourceType::File,
                location: None,
                created_at: now,
                modified_at: now,
            })
            .await
            .unwrap();
        element_creation_service
            .create_folder(crate::elements::dto::create_folder_dto::CreateFolderDto {
                meta: CreateMetaDto {
                    name: "Parent folder".to_string(),
                    parent: None,
                    origin: Origin::Custom {
                        derived_from: None,
                        bibliographical_source_id: Some(bibliographical_source_id),
                    },
                },
            })
            .await
            .unwrap();
        let parent = folder_repository.get_all().await.unwrap().remove(0);
        let parent_id = parent.meta.element_id;

        let tool = CreateCard::new(
            element_creation_service,
            Arc::new(EchoLexicalJsonConverter),
            Some(parent_id),
        );

        // Act

        tool.call(
            &mut ToolContext::default(),
            CreateCardArgs {
                front: "What is the capital of France?".to_string(),
                back: "Paris".to_string(),
            },
        )
        .await
        .unwrap();

        // Assert

        let cards = card_repository.get_all().await.unwrap();
        assert_eq!(1, cards.len());
        assert_eq!(Some(parent_id), cards[0].meta.derived_from);
        assert_eq!(
            Some(bibliographical_source_id),
            cards[0].meta.bibliographical_source_id
        );
    }
}
