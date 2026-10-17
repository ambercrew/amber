use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::client::AgentClientExt;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::{format_context_snippets, preamble};
use crate::ai_integration::services::agent_provider::{
    AgentProvider, AgentProviderError, AppAgent,
};
use crate::ai_integration::services::ai_client_provider::AiClientProvider;
use crate::ai_integration::services::tools_provider::ToolsProvider;
use crate::ai_integration::tools::element_reference::element_reference;
use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceService;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;

const DEFAULT_TEMPERATURE: f64 = 0.5;
const DEFAULT_MAX_TURN: usize = 16;

#[derive(ScopeInjectable)]
pub struct DefaultAgentProvider {
    ai_client_provider: Arc<dyn AiClientProvider>,
    meta_repository: Arc<dyn MetaRepository>,
    bibliographical_source_service: Arc<dyn BibliographicalSourceService>,
    tools_provider: Arc<dyn ToolsProvider>,
}

impl DefaultAgentProvider {
    /// Builds the "**Context:**" section of the preamble: the name of the
    /// element the user is currently viewing, if relevant the bibliographical
    /// source (title + authors) it was derived from, and any text snippets
    /// the user selected and added as extra context.
    async fn build_context(
        &self,
        element_id: Option<ElementId>,
        context_snippets: &[String],
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

        if let Some(snippet_lines) = format_context_snippets(context_snippets) {
            lines.push(snippet_lines);
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
        context_snippets: &[String],
    ) -> Result<AppAgent, AgentProviderError> {
        let client = self.ai_client_provider.get_client().await?;
        let completion_model_name = self.ai_client_provider.get_completion_model_name().await?;
        let context = self.build_context(element_id, context_snippets).await?;

        let builder = client
            .agent(&completion_model_name)
            .temperature(DEFAULT_TEMPERATURE)
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
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository;
    use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
    use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
    use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
    use std::sync::atomic::{AtomicBool, Ordering};

    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use rig::{
        completion::{CompletionResponse, Prompt, Usage},
        message::{AssistantContent, Message as RigMessage},
    };
    use tokio::sync::Mutex;
    use uuid::Uuid;

    use crate::{
        ai_integration::{
            ai_state::AiState,
            clients::mock_client::{MOCK_PROVIDER, MockClient},
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
        register_scope!(injector, dyn ToolsProvider, DefaultToolsProvider);
        register_scope!(injector, dyn AgentProvider, DefaultAgentProvider);

        injector
    }

    fn mock_response_with_text(text: &str) -> CompletionResponse {
        CompletionResponse::new(
            vec![AssistantContent::text(text)],
            Usage::default(),
            MOCK_PROVIDER,
        )
    }

    #[tokio::test]
    pub async fn get_agent_no_document_messages_only_added_card_tool() {
        // Arrange

        let only_card_tool_sent = Arc::new(AtomicBool::new(false));
        let only_card_tool_sent_clone = only_card_tool_sent.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                only_card_tool_sent_clone.store(
                    request.tools.len() == 1 && request.tools[0].name == "create_card",
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
            .get_agent(Uuid::new_v4(), &messages, None, &[])
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(only_card_tool_sent.load(Ordering::Relaxed));
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
            .get_agent(Uuid::new_v4(), &[], Some(element_id), &[])
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
                    request.tools.len() == 2
                        && request
                            .tools
                            .iter()
                            .any(|tool| tool.name == "search_documents")
                        && request.tools.iter().any(|tool| tool.name == "create_card"),
                    Ordering::Relaxed,
                );
                mock_response_with_text("Answer")
            }))),
            embeddings_model_dims: Some(
                crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS,
            ),
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
            .get_agent(Uuid::new_v4(), &messages, None, &[])
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
            embeddings_model_dims: Some(
                crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS,
            ),
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
            .get_agent(Uuid::new_v4(), &messages, None, &[])
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
                let has_context = request.chat_history.iter().any(|message| {
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

        let agent = service
            .get_agent(Uuid::new_v4(), &[], None, &[])
            .await
            .unwrap();
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
                let has_context = request.chat_history.iter().any(|message| {
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
            .get_agent(Uuid::new_v4(), &[], Some(element_id), &[])
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(found_context.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn get_agent_with_context_snippets_added_them_to_preamble_without_element() {
        // Arrange

        let found_context = Arc::new(AtomicBool::new(false));
        let found_context_clone = found_context.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                let has_context = request.chat_history.iter().any(|message| {
                    matches!(
                        message,
                        RigMessage::System { content } if content.contains("Selected passage")
                    )
                });
                found_context_clone.store(has_context, Ordering::Relaxed);
                mock_response_with_text("Answer")
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AgentProvider>().await;

        // Act

        let agent = service
            .get_agent(Uuid::new_v4(), &[], None, &["Selected passage".to_string()])
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(found_context.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn get_agent_with_blank_context_snippet_did_not_add_context_to_preamble() {
        // Arrange

        let preamble_has_context = Arc::new(AtomicBool::new(true));
        let preamble_has_context_clone = preamble_has_context.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                let has_context = request.chat_history.iter().any(|message| {
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

        let agent = service
            .get_agent(Uuid::new_v4(), &[], None, &["   ".to_string()])
            .await
            .unwrap();
        agent.agent.prompt("Hello").await.unwrap();

        // Assert

        assert!(!preamble_has_context.load(Ordering::Relaxed));
    }
}
