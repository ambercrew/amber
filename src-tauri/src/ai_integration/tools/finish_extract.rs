use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::FINISH_EXTRACT_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::ai_integration::tools::element_reference::element_reference;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::services::learning_asset_scheduling_service::{
    LearningAssetSchedulingError, LearningAssetSchedulingService,
};

/// Takes nothing; the tool always acts on the extract the chat was opened on.
#[derive(Deserialize, Debug, Clone, Default, Serialize, schemars::JsonSchema)]
pub struct FinishExtractArgs {}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishExtractOutput {
    pub extract_id: Uuid,
}

#[derive(Error, Debug)]
pub enum FinishExtractError {
    #[error("The chat has no open extract")]
    NoExtract,
    #[error("Failed to finish the extract")]
    Scheduling(#[from] LearningAssetSchedulingError),
}

pub struct FinishExtract {
    learning_asset_scheduling_service: Arc<dyn LearningAssetSchedulingService>,
    extract: Option<Uuid>,
}

impl FinishExtract {
    /// `element` is the chat's open element; the tool is only offered when it's an extract.
    pub fn new(
        learning_asset_scheduling_service: Arc<dyn LearningAssetSchedulingService>,
        element: Option<ElementId>,
    ) -> Self {
        Self {
            learning_asset_scheduling_service,
            extract: match element {
                Some(ElementId::Extract(id)) => Some(id),
                _ => None,
            },
        }
    }
}

impl Tool for FinishExtract {
    const NAME: &'static str = "finish_extract";

    type Error = FinishExtractError;
    type Args = FinishExtractArgs;
    type Output = FinishExtractOutput;

    fn description(&self) -> String {
        FINISH_EXTRACT_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(FinishExtractArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        _args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let extract_id = self.extract.ok_or(FinishExtractError::NoExtract)?;

        self.learning_asset_scheduling_service
            .finish(ElementId::Extract(extract_id), None)
            .await?;

        Ok(FinishExtractOutput { extract_id })
    }
}

impl AppTool for FinishExtract {
    const REQUIRES_APPROVAL: bool = true;

    fn is_applicable(&self, _messages: &[Message]) -> bool {
        self.extract.is_some()
    }

    fn approval_markdown(&self, _args: &Self::Args) -> Option<String> {
        Some(match self.extract {
            Some(id) => format!("Finish {}", element_reference(ElementId::Extract(id))),
            None => "Finish the extract; it no longer exists".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::{
            entities::extract::Extract,
            repositories::{
                extract_repository::ExtractRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::meta::Meta,
        },
        infrastructure::repositories::sqlite::{
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::{
            repositories::{
                learning_asset_review_log_repository::LearningAssetReviewLogRepository,
                learning_asset_review_repository::LearningAssetReviewRepository,
                study_profile_repository::StudyProfileRepository,
            },
            services::{
                implementations::{
                    default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService,
                    default_profile_resolution_service::DefaultProfileResolutionService,
                },
                profile_resolution_service::ProfileResolutionService,
            },
        },
        test_utils::create_test_injector,
    };

    use crate::common::event_manager::EventManager;
    use crate::study::events::element_due_changed_event::ELEMENT_DUE_CHANGED_EVENT;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;

        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(
            injector,
            dyn LearningAssetReviewLogRepository,
            SqliteLearningAssetReviewLogRepository
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
            dyn LearningAssetSchedulingService,
            DefaultLearningAssetSchedulingService
        );

        injector
    }

    async fn create_tool(
        scope: &injector::injector_scope::InjectorScope<'_>,
        element: Option<ElementId>,
    ) -> FinishExtract {
        FinishExtract::new(
            scope.resolve::<dyn LearningAssetSchedulingService>().await,
            element,
        )
    }

    async fn create_extract(scope: &injector::injector_scope::InjectorScope<'_>) -> Uuid {
        let id = Uuid::new_v4();
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(Extract {
                meta: Meta {
                    element_id: ElementId::Extract(id),
                    name: "Extract".into(),
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
                },
                content: String::new(),
                interval_multiplier: 1.2,
            })
            .await
            .unwrap();
        id
    }

    async fn is_finished(scope: &injector::injector_scope::InjectorScope<'_>, id: Uuid) -> bool {
        scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .get_by_element_id(id)
            .await
            .unwrap()
            .is_some_and(|review| review.finished_at.is_some())
    }

    #[tokio::test]
    async fn call_open_extract_marked_it_finished() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_id = create_extract(&scope).await;
        let tool = create_tool(&scope, Some(ElementId::Extract(extract_id))).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), FinishExtractArgs {})
            .await
            .unwrap();

        // Assert

        assert_eq!(extract_id, actual.extract_id);
        assert!(is_finished(&scope, extract_id).await);
    }

    #[derive(Default)]
    struct RecordingEventManager {
        names: std::sync::Mutex<Vec<String>>,
    }

    #[async_trait::async_trait]
    impl EventManager for RecordingEventManager {
        async fn push(&self, name: &str, _body: Value) {
            self.names.lock().unwrap().push(name.to_string());
        }

        async fn emit_all(&self) {}
    }

    #[tokio::test]
    async fn call_open_extract_pushed_element_due_changed_event() {
        // Arrange

        let mut injector = initialize_test_injector().await;
        let event_manager = Arc::new(RecordingEventManager::default());
        injector.register_singleton::<dyn EventManager>(event_manager.clone());
        let scope = injector.start_scope();
        let extract_id = create_extract(&scope).await;
        let tool = create_tool(&scope, Some(ElementId::Extract(extract_id))).await;

        // Act

        tool.call(&mut ToolContext::default(), FinishExtractArgs {})
            .await
            .unwrap();

        // Assert

        assert!(
            event_manager
                .names
                .lock()
                .unwrap()
                .contains(&ELEMENT_DUE_CHANGED_EVENT.to_string())
        );
    }

    #[tokio::test]
    async fn call_no_open_extract_returned_no_extract() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tool = create_tool(&scope, Some(ElementId::Folder(Uuid::new_v4()))).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), FinishExtractArgs {})
            .await;

        // Assert

        assert!(matches!(actual, Err(FinishExtractError::NoExtract)));
    }

    #[tokio::test]
    async fn is_applicable_open_extract_returned_true() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tool = create_tool(&scope, Some(ElementId::Extract(Uuid::new_v4()))).await;

        // Act

        let actual = tool.is_applicable(&[]);

        // Assert

        assert!(actual);
    }

    #[tokio::test]
    async fn is_applicable_other_or_no_open_element_returned_false() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_tool =
            create_tool(&scope, Some(ElementId::LearningAsset(Uuid::new_v4()))).await;
        let no_element_tool = create_tool(&scope, None).await;

        // Act

        let actual = (
            learning_asset_tool.is_applicable(&[]),
            no_element_tool.is_applicable(&[]),
        );

        // Assert

        assert_eq!((false, false), actual);
    }

    #[tokio::test]
    async fn approval_markdown_open_extract_referenced_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = Uuid::new_v4();
        let tool = create_tool(&scope, Some(ElementId::Extract(id))).await;

        // Act

        let actual = tool.approval_markdown(&FinishExtractArgs {});

        // Assert

        assert_eq!(
            Some(format!(
                "Finish {}",
                element_reference(ElementId::Extract(id))
            )),
            actual
        );
    }
}
