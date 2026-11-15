use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::AgentBuilder;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::preamble;
use crate::ai_integration::services::agent_provider::{
    AgentProvider, AgentProviderError, AppAgent,
};
use crate::ai_integration::services::ai_client_provider::AiClientProvider;
use crate::ai_integration::services::tools_provider::ToolsProvider;
use crate::ai_integration::tools::element_reference::element_reference;
use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceService;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::services::content_search_service::ContentSearchService;

const DEFAULT_TEMPERATURE: f64 = 0.5;
const DEFAULT_MAX_TURN: usize = 16;

#[derive(ScopeInjectable)]
pub struct DefaultAgentProvider {
    ai_client_provider: Arc<dyn AiClientProvider>,
    meta_repository: Arc<dyn MetaRepository>,
    bibliographical_source_service: Arc<dyn BibliographicalSourceService>,
    tools_provider: Arc<dyn ToolsProvider>,
    content_search_service: Arc<dyn ContentSearchService>,
}

impl DefaultAgentProvider {
    /// Builds the "**Context:**" section of the preamble: the name of the
    /// element the user is currently viewing, how the model can see its content, and
    /// if relevant the bibliographical source (title + authors) it was derived from.
    /// Snippets travel with the message they were attached to instead.
    async fn build_context(
        &self,
        element_id: Option<ElementId>,
    ) -> Result<Option<String>, AgentProviderError> {
        let mut lines = Vec::new();

        if let Some(element_id) = element_id {
            let meta = self.meta_repository.get_by_id(element_id.id()).await?;
            lines.push(format!(
                "- The user is currently viewing a {} named \"{}\" ({}).",
                element_id.element_name(),
                meta.name,
                element_reference(element_id)
            ));
            // Otherwise it may answer from the name alone; folders have no content to see.
            if !matches!(element_id, ElementId::Folder(_)) {
                let searchable = self
                    .content_search_service
                    .has_searchable_text(element_id)
                    .await?;
                lines.push(if searchable {
                    "- You can't see its content, only what you search for or the user attaches."
                        .to_string()
                } else {
                    "- You can't see its content, only what the user attaches.".to_string()
                });
            }

            if let Some(bibliographical_source_id) = meta.bibliographical_source_id {
                let source = self
                    .bibliographical_source_service
                    .get_bibliographical_source(bibliographical_source_id)
                    .await?
                    .bibliographical_source;

                let origin = match source.authors {
                    Some(authors) => format!("\"{}\" by {authors}", source.title),
                    None => format!("\"{}\"", source.title),
                };
                lines.push(format!("- It originates from {origin}."));
            }
        }

        if lines.is_empty() {
            return Ok(None);
        }

        Ok(Some(lines.join("\n")))
    }
}

#[async_trait]
impl AgentProvider for DefaultAgentProvider {
    async fn get_agent(
        &self,
        chat_id: Uuid,
        messages: &[Message],
        element_id: Option<ElementId>,
    ) -> Result<AppAgent, AgentProviderError> {
        let client = self.ai_client_provider.get_client().await?;
        let completion_model_name = self.ai_client_provider.get_completion_model_name().await?;
        let context = self.build_context(element_id).await?;

        let mut builder = AgentBuilder::new(client.completion(&completion_model_name));
        if client.supports_temperature() {
            builder = builder.temperature(DEFAULT_TEMPERATURE);
        }
        let builder = builder
            .name("Amber Tutor")
            .default_max_turns(DEFAULT_MAX_TURN)
            .preamble(preamble(context.as_deref()).as_str());

        let tools_context = self.tools_provider.capture_context(chat_id, element_id);
        let (tool_server, approval_hook) = self
            .tools_provider
            .get_tools(&tools_context)
            .await?
            .into_agent_tools(messages);

        Ok(AppAgent {
            agent: builder.tool_server_handle(tool_server).build(),
            approval_hook,
            tools_context,
        })
    }
}

#[cfg(test)]
pub mod tests {
    use crate::elements::value_objects::name_source::NameSource;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository;
    use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
    use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
    use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
    use std::sync::atomic::{AtomicBool, Ordering};

    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use rig::message::{AssistantContent, Message as RigMessage};
    use tokio::sync::Mutex;
    use uuid::Uuid;

    use crate::{
        ai_integration::{
            ai_state::AiState,
            clients::mock_client::MockClient,
            entities::message::{DocumentContent, Message, MessageContent},
            services::implementations::default_ai_client_provider::DefaultAiClientProvider,
        },
        bibliographical_sources::{
            repositories::bibliographical_source_repository::BibliographicalSourceRepository,
            services::implementations::default_bibliographical_source_service::DefaultBibliographicalSourceService,
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
            value_objects::meta::Meta,
        },
        infrastructure::repositories::{
            disk::disk_settings_repository::DiskSettingsRepository,
            sqlite::{
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
        },
        settings::{
            entities::settings::Settings, repositories::settings_repository::SettingsRepository,
            value_objects::settings_profile::SettingsProfile,
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
        test_utils::{create_temp_directory, create_test_injector},
    };

    use crate::ai_integration::services::implementations::default_tools_provider::DefaultToolsProvider;
    use crate::common::services::lexical_json_converter::{
        LexicalJsonConverter, LexicalJsonConverterError,
    };
    use crate::elements::services::element_creation_service::ElementCreationService;

    use super::*;
    use crate::ai_integration::repositories::ai_document_repository::AiDocumentRepository;
    use crate::ai_integration::services::document_search_service::DocumentSearchService;
    use crate::ai_integration::services::implementations::default_document_search_service::DefaultDocumentSearchService;
    use crate::elements::entities::extract::Extract;
    use crate::infrastructure::repositories::sqlite::sqlite_ai_document_repository::SqliteAiDocumentRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_content_search_repository::SqliteContentSearchRepository;
    use crate::search::repositories::content_search_repository::ContentSearchRepository;
    use crate::search::services::content_search_service::ContentSearchService;
    use crate::search::services::implementations::default_content_search_service::DefaultContentSearchService;

    struct MockLexicalJsonConverter;

    #[async_trait]
    impl LexicalJsonConverter for MockLexicalJsonConverter {
        async fn convert_markdown(
            &self,
            markdown: &str,
        ) -> Result<String, LexicalJsonConverterError> {
            Ok(markdown.to_string())
        }
    }

    async fn initialize_test_injector(mock_client: MockClient) -> Injector {
        let mut injector = create_test_injector().await;

        let mut settings = Settings::new(create_temp_directory().await, SettingsProfile::Default);
        settings.enable_ai = true;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton(Arc::new(mock_client));
        injector.register_singleton(Arc::new(AiState::default()));
        injector.register_singleton::<dyn LexicalJsonConverter>(Arc::new(MockLexicalJsonConverter));

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);
        register_scope!(
            injector,
            dyn AiDocumentRepository,
            SqliteAiDocumentRepository
        );
        register_scope!(
            injector,
            dyn DocumentSearchService,
            DefaultDocumentSearchService
        );
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
        register_scope!(
            injector,
            dyn BibliographicalSourceService,
            DefaultBibliographicalSourceService
        );
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
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
        register_scope!(
            injector,
            dyn LearningAssetReviewLogRepository,
            SqliteLearningAssetReviewLogRepository
        );
        register_scope!(
            injector,
            dyn LearningAssetSchedulingService,
            DefaultLearningAssetSchedulingService
        );
        register_scope!(
            injector,
            dyn ContentSearchRepository,
            SqliteContentSearchRepository
        );
        register_scope!(
            injector,
            dyn ContentSearchService,
            DefaultContentSearchService
        );
        register_scope!(injector, dyn ToolsProvider, DefaultToolsProvider);
        register_scope!(injector, dyn AgentProvider, DefaultAgentProvider);

        injector
    }

    fn mock_response_with_text(text: &str) -> Vec<AssistantContent> {
        vec![AssistantContent::text(text)]
    }

    #[tokio::test]
    pub async fn get_agent_no_document_messages_only_added_card_tools() {
        // Arrange

        let only_card_tools_sent = Arc::new(AtomicBool::new(false));
        let only_card_tools_sent_clone = only_card_tools_sent.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                only_card_tools_sent_clone.store(
                    request.tools.len() == 2
                        && request.tools.iter().any(|tool| tool.name == "create_card")
                        && request
                            .tools
                            .iter()
                            .any(|tool| tool.name == "create_cloze_card"),
                    Ordering::Relaxed,
                );
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AgentProvider>().await;

        let messages = vec![Message::new(
            None,
            Uuid::new_v4(),
            MessageContent::Human("Hello".to_string()),
        )];

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &messages, None)
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(only_card_tools_sent.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn get_agent_open_extract_added_finish_extract_tool() {
        // Arrange

        let mark_tool_sent = Arc::new(AtomicBool::new(false));
        let mark_tool_sent_clone = mark_tool_sent.clone();
        let element_id = ElementId::Extract(Uuid::new_v4());

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                mark_tool_sent_clone.store(
                    request
                        .tools
                        .iter()
                        .any(|tool| tool.name == "finish_extract"),
                    Ordering::Relaxed,
                );
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        scope
            .resolve::<dyn MetaRepository>()
            .await
            .create_meta(&make_meta(element_id, None))
            .await
            .unwrap();
        let service = scope.resolve::<dyn AgentProvider>().await;

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &[], Some(element_id))
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(mark_tool_sent.load(Ordering::Relaxed));
        assert!(agent.approval_hook.requires_approval("finish_extract"));
    }

    #[tokio::test]
    pub async fn get_agent_has_document_message_added_search_tool() {
        // Arrange

        let search_tool_sent = Arc::new(AtomicBool::new(false));
        let search_tool_sent_clone = search_tool_sent.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                search_tool_sent_clone.store(
                    request.tools.len() == 3
                        && request
                            .tools
                            .iter()
                            .any(|tool| tool.name == "search_documents")
                        && request.tools.iter().any(|tool| tool.name == "create_card"),
                    Ordering::Relaxed,
                );
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AgentProvider>().await;

        let messages = vec![Message::new(
            None,
            Uuid::new_v4(),
            MessageContent::Document(DocumentContent {
                file_name: "file.pdf".to_string(),
            }),
        )];

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &messages, None)
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(search_tool_sent.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn get_agent_has_document_message_required_approval_only_for_tools_declaring_it() {
        // Arrange

        let mock_client = MockClient {
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AgentProvider>().await;

        let messages = vec![Message::new(
            None,
            Uuid::new_v4(),
            MessageContent::Document(DocumentContent {
                file_name: "file.pdf".to_string(),
            }),
        )];

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &messages, None)
            .await
            .unwrap();

        // Assert

        assert!(agent.approval_hook.requires_approval("create_card"));
        assert!(!agent.approval_hook.requires_approval("search_documents"));
    }

    fn make_meta(id: ElementId, bibliographical_source_id: Option<Uuid>) -> Meta {
        Meta {
            element_id: id,
            name: "My Learning Asset".into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            derived_from: None,
            study_profile_id: None,
            bibliographical_source_id,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    #[tokio::test]
    pub async fn get_agent_no_element_id_did_not_add_context_to_preamble() {
        // Arrange

        let preamble_has_context = Arc::new(AtomicBool::new(true));
        let preamble_has_context_clone = preamble_has_context.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                let has_context = request.chat_history.iter().map(Arc::as_ref).any(|message| {
                    matches!(
                        message,
                        RigMessage::System { content } if content.contains("**Context:**")
                    )
                });
                preamble_has_context_clone.store(has_context, Ordering::Relaxed);
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AgentProvider>().await;

        // Act

        let agent = service.get_agent(Uuid::new_v4(), &[], None).await.unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(!preamble_has_context.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn get_agent_with_element_id_added_element_reference_and_origin_to_preamble() {
        // Arrange

        let found_context = Arc::new(AtomicBool::new(false));
        let found_context_clone = found_context.clone();
        let element_id = ElementId::LearningAsset(Uuid::new_v4());
        let reference = element_reference(element_id);

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                let has_context = request.chat_history.iter().map(Arc::as_ref).any(|message| {
                    matches!(
                        message,
                        RigMessage::System { content }
                            if content.contains("My Learning Asset")
                                && content.contains(&reference)
                                && content.contains("My Book")
                                && content.contains("Jane Doe")
                    )
                });
                found_context_clone.store(has_context, Ordering::Relaxed);
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let bibliographical_source_service =
            scope.resolve::<dyn BibliographicalSourceService>().await;

        let bibliographical_source = bibliographical_source_service
            .create_or_reuse_bibliographical_source(
                crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceFields {
                    title: "My Book".into(),
                    authors: Some("Jane Doe".into()),
                    publication_date: None,
                    source_type:
                        crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType::File,
                    location: None,
                },
            )
            .await
            .unwrap();

        meta_repository
            .create_meta(&make_meta(element_id, Some(bibliographical_source.id)))
            .await
            .unwrap();

        let service = scope.resolve::<dyn AgentProvider>().await;

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &[], Some(element_id))
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(found_context.load(Ordering::Relaxed));
    }
    /// The system messages the agent sends for one prompt with `element_id` open, once `create` made it.
    async fn system_text_for(
        element_id: ElementId,
        create: impl AsyncFnOnce(&injector::injector_scope::InjectorScope<'_>),
    ) -> String {
        let system_text = Arc::new(std::sync::Mutex::new(String::new()));
        let system_text_clone = system_text.clone();
        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                let text: String = request
                    .chat_history
                    .iter()
                    .filter_map(|message| match message.as_ref() {
                        RigMessage::System { content } => Some(content.clone()),
                        _ => None,
                    })
                    .collect();
                *system_text_clone.lock().unwrap() = text;
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };
        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        create(&scope).await;
        let service = scope.resolve::<dyn AgentProvider>().await;

        let agent = service
            .get_agent(Uuid::new_v4(), &[], Some(element_id))
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        system_text.lock().unwrap().clone()
    }

    #[tokio::test]
    pub async fn get_agent_open_element_with_text_said_content_is_searchable() {
        // Arrange

        let element_id = ElementId::Extract(Uuid::new_v4());

        // Act

        let actual = system_text_for(element_id, async |scope| {
            scope
                .resolve::<dyn ExtractRepository>()
                .await
                .create(Extract {
                    meta: make_meta(element_id, None),
                    content: String::new(),
                    interval_multiplier: 1.2,
                })
                .await
                .unwrap();
        })
        .await;

        // Assert

        assert!(actual.contains("only what you search for or the user attaches"));
    }

    #[tokio::test]
    pub async fn get_agent_open_element_without_text_said_only_attachments_are_visible() {
        // Arrange

        // A learning asset with no splits, like a PDF.
        let element_id = ElementId::LearningAsset(Uuid::new_v4());

        // Act

        let actual = system_text_for(element_id, async |scope| {
            scope
                .resolve::<dyn MetaRepository>()
                .await
                .create_meta(&make_meta(element_id, None))
                .await
                .unwrap();
        })
        .await;

        // Assert

        assert!(actual.contains("You can't see its content, only what the user attaches."));
    }
}
