use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::streaming::StreamedUserContent;
use rig::{
    agent::{MultiTurnStreamItem, StreamingError, Text},
    completion::PromptError,
    streaming::{StreamedAssistantContent, StreamingChat},
};
use tokio::sync::Mutex;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::ai_integration::ai_state::AiState;
use crate::ai_integration::dto::stream_ai_request_dto::StreamAiRequestDto;
use crate::ai_integration::entities::chat::Chat;
use crate::ai_integration::entities::context_snippet::{ContextSnippet, group_snippets_by_message};
use crate::ai_integration::entities::message::{
    Message, MessageContent, ToolApproval, ToolCallContent, ToolResultContent,
};
use crate::ai_integration::prompts::{approval_result_text, with_context_snippets};
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::agent_provider::{
    AgentProvider, AgentProviderError, AppAgent,
};
use crate::ai_integration::services::ai_client_provider::AiClientProviderError;
use crate::ai_integration::services::ai_streamer::{
    AiStreamer, AiStreamerError, OnEventCallback, StreamLlmResponseEvent,
};
use crate::ai_integration::services::chat_creator::{ChatCreator, ChatCreatorError};
use crate::ai_integration::services::tool_approval_resolver::ToolApprovalResolver;
use crate::ai_integration::state_cancellation_hook::StateCancellationHook;
use crate::database::transaction_manager::TransactionManager;

#[derive(ScopeInjectable)]
pub struct DefaultAiStreamer {
    state: Arc<AiState>,
    ai_repository: Arc<dyn AiRepository>,
    chat_creator: Arc<dyn ChatCreator>,
    agent_provider: Arc<dyn AgentProvider>,
    tool_approval_resolver: Arc<dyn ToolApprovalResolver>,
    transaction_manager: Arc<dyn TransactionManager>,
}

#[async_trait]
impl AiStreamer for DefaultAiStreamer {
    async fn stream(
        &self,
        request: StreamAiRequestDto,
        on_event: OnEventCallback,
    ) -> Result<(), AiStreamerError> {
        let _guard = self.state.start_generation().await;

        let messages;
        let chat_id;
        let context_snippets_by_message: HashMap<Uuid, Vec<String>>;
        let mut chat_to_upsert = None;
        if let Some(request_chat_id) = request.chat_id {
            chat_id = request_chat_id;
            messages = self
                .ai_repository
                .get_chat_messages_ordered(chat_id)
                .await?;
            context_snippets_by_message = group_snippets_by_message(
                self.ai_repository
                    .get_context_snippets_for_chat(chat_id)
                    .await?,
            );
        } else {
            let chat = match self.chat_creator.create_chat(&request.prompt).await {
                Ok(chat) => chat,
                // Cancelling before a chat title exists yet has nothing to
                // roll back — just stop like a mid-stream cancellation does.
                Err(ChatCreatorError::Cancelled) => return Ok(()),
                Err(err) => return Err(err.into()),
            };
            chat_id = chat.id();
            messages = Vec::new();
            context_snippets_by_message = HashMap::new();
            on_event(StreamLlmResponseEvent::CreatedChat(chat.clone()))?;
            chat_to_upsert = Some(chat);
        }

        let human_message =
            Message::new(None, chat_id, MessageContent::Human(request.prompt.clone()));
        let context_snippets_to_upsert: Vec<ContextSnippet> = request
            .context_snippets
            .iter()
            .enumerate()
            .map(|(position, snippet)| {
                ContextSnippet::new(None, human_message.id(), snippet.clone(), position as i64)
            })
            .collect();

        let messages_to_upsert = Arc::new(Mutex::new(vec![human_message]));

        // A cancellation while building the agent (e.g. during the embeddings
        // dimension probe, which has no hook to check mid-flight) has no
        // completion to stream — skip straight to persisting what already
        // exists, same as a mid-stream cancellation falls through below.
        let agent = match self
            .agent_provider
            .get_agent(chat_id, &messages, request.element_id)
            .await
        {
            Ok(agent) => Some(agent),
            Err(AgentProviderError::AiClientProvider(AiClientProviderError::Cancelled)) => None,
            Err(err) => return Err(err.into()),
        };

        // The transaction resolved above (for the initial reads and agent
        // setup) would otherwise stay open — and its snapshot stale — for the
        // whole LLM round-trip, so committing it here before the potentially
        // long streaming loop avoids a SQLITE_BUSY_SNAPSHOT when the deferred
        // writes below finally run against a fresh transaction.
        self.transaction_manager.save_changes().await?;

        let mut complete_ai_response = String::new();
        let mut failed = false;
        let mut called_tools = false;

        if let Some(AppAgent {
            agent,
            approval_hook,
            tools_context,
        }) = agent
        {
            let rig_messages: Vec<rig::message::Message> = merge_consecutive_assistant_messages(
                with_current_approval_statuses(messages)
                    .into_iter()
                    .filter_map(|m| {
                        let snippets = context_snippets_by_message
                            .get(&m.id())
                            .cloned()
                            .unwrap_or_default();
                        m.try_into_rig_message(&snippets).ok()
                    })
                    .collect(),
            );
            let mut stream = agent
                .stream_chat(
                    with_context_snippets(&request.prompt, &request.context_snippets),
                    rig_messages,
                )
                .add_hook(StateCancellationHook::new(self.state.clone()))
                .add_hook(approval_hook.clone())
                .await;

            // A running tool may be mid-write, so cancelling only interrupts the wait for the model.
            let mut running_tools = 0usize;
            loop {
                let next = if running_tools > 0 {
                    stream.next().await
                } else {
                    tokio::select! {
                        next = stream.next() => next,
                        () = self.state.cancelled() => break,
                    }
                };
                let Some(content) = next else { break };
                match content {
                    Ok(content) => {
                        if let MultiTurnStreamItem::StreamAssistantItem(
                            StreamedAssistantContent::Text(Text { text, .. }),
                        ) = content
                        {
                            complete_ai_response = format!("{complete_ai_response}{text}");
                            on_event(StreamLlmResponseEvent::InProgress { chat_id, text })?;
                        } else if let MultiTurnStreamItem::StreamAssistantItem(
                            StreamedAssistantContent::ToolCall {
                                tool_call,
                                internal_call_id,
                            },
                        ) = content
                        {
                            log::info!("Tool call: {:#?}", tool_call);
                            called_tools = true;
                            running_tools += 1;

                            let mut tool_call_content: ToolCallContent = tool_call.into();
                            // Some providers (e.g. Ollama, whose chat API has
                            // no tool-call id concept) always hand back an
                            // empty id, which would otherwise make every call
                            // in a chat indistinguishable to consumers pairing
                            // calls with results by id. Fall back to rig's own
                            // `internal_call_id`, which it generates uniquely
                            // per call regardless of provider.
                            if tool_call_content.id.is_empty() {
                                tool_call_content.id = internal_call_id;
                            }
                            if approval_hook.requires_approval(&tool_call_content.name) {
                                tool_call_content.approval =
                                    Some(ToolApproval::pending(tools_context.clone()));
                            }

                            let message = Message::new(
                                None,
                                chat_id,
                                MessageContent::ToolCall(tool_call_content.clone()),
                            );
                            let message_id = message.id();
                            {
                                let mut pending = messages_to_upsert.lock().await;
                                pending.push(message);
                                self.persist(&mut chat_to_upsert, &mut pending).await?;
                            }
                            self.transaction_manager.save_changes().await?;

                            let approval_markdown = self
                                .tool_approval_resolver
                                .approval_markdown(&tool_call_content)
                                .await?
                                .map(|markdown| markdown.request);
                            on_event(StreamLlmResponseEvent::ToolCall {
                                chat_id,
                                tool_call: tool_call_content,
                                message_id,
                                approval_markdown,
                            })?;
                        } else if let MultiTurnStreamItem::StreamUserItem(
                            StreamedUserContent::ToolResult {
                                tool_result,
                                internal_call_id,
                            },
                        ) = content
                        {
                            log::info!("Tool result: {:#?}", tool_result);
                            running_tools = running_tools.saturating_sub(1);

                            let mut tool_result_content: ToolResultContent = tool_result.into();
                            if tool_result_content.id.is_empty() {
                                tool_result_content.id = internal_call_id;
                            }
                            on_event(StreamLlmResponseEvent::ToolResult {
                                chat_id,
                                tool_result: tool_result_content.clone(),
                            })?;
                            messages_to_upsert.lock().await.push(Message::new(
                                None,
                                chat_id,
                                MessageContent::ToolResult(tool_result_content),
                            ));
                            self.transaction_manager.save_changes().await?;
                        }
                    }
                    Err(err) => {
                        log::error!("Error happened while streaming {:?}", err);

                        let is_cancelled = matches!(&err, StreamingError::Prompt(p) if matches!(**p, PromptError::PromptCancelled { .. }));

                        if !is_cancelled {
                            failed = true;
                            let error_message = match err {
                                StreamingError::Completion(completion_err) => {
                                    AiStreamerError::try_from(completion_err)
                                        .map_or_else(|e| e.to_string(), |e| e.to_string())
                                }
                                StreamingError::Prompt(prompt_err) => match *prompt_err {
                                    PromptError::CompletionError(completion_err) => {
                                        AiStreamerError::try_from(completion_err)
                                            .map_or_else(|e| e.to_string(), |e| e.to_string())
                                    }
                                    other => other.to_string(),
                                },
                            };
                            on_event(StreamLlmResponseEvent::Error(error_message))?;
                        }
                        break;
                    }
                };
            }
        }

        if !complete_ai_response.trim().is_empty() {
            let mut messages_to_upsert = messages_to_upsert.lock().await;
            messages_to_upsert.push(Message::new(
                None,
                chat_id,
                MessageContent::Assistant(complete_ai_response),
            ));
        }

        // Delaying database operations to the end to avoid the writes from locking
        // the database.
        // A failed turn's messages are dropped so the user can resend the prompt, unless
        // a tool already ran and its side effects (e.g. a created card) need recording.
        if failed && !called_tools {
            return self.persist(&mut chat_to_upsert, &mut Vec::new()).await;
        }

        self.persist(&mut chat_to_upsert, &mut *messages_to_upsert.lock().await)
            .await?;

        for snippet in &context_snippets_to_upsert {
            self.ai_repository.upsert_context_snippet(snippet).await?;
        }

        Ok(())
    }
}

impl DefaultAiStreamer {
    /// Writes the chat (if new) and the queued messages, draining the queue.
    async fn persist(
        &self,
        chat_to_upsert: &mut Option<Chat>,
        messages: &mut Vec<Message>,
    ) -> Result<(), AiStreamerError> {
        if let Some(chat) = chat_to_upsert.take() {
            self.ai_repository.upsert_chat(&chat).await?;
        }
        for message in messages.drain(..) {
            self.ai_repository.upsert_message(&message).await?;
        }
        Ok(())
    }
}

/// Rewrites the result of each call awaiting approval to where it now stands, so the
/// model knows which calls the user approved or rejected since.
fn with_current_approval_statuses(mut messages: Vec<Message>) -> Vec<Message> {
    let approvals: HashMap<String, ToolApproval> = messages
        .iter()
        .filter_map(|message| match message.content() {
            MessageContent::ToolCall(ToolCallContent {
                id,
                approval: Some(approval),
                ..
            }) => Some((id.clone(), approval.clone())),
            _ => None,
        })
        .collect();

    for message in &mut messages {
        if let MessageContent::ToolResult(result) = message.content_mut()
            && let Some(approval) = approvals.get(&result.id)
        {
            result.text = approval_result_text(approval.status, approval.output.as_deref());
        }
    }

    messages
}

/// A single model turn's tool calls stream in as separate `ToolCall` items
/// before any of their `ToolResult`s arrive, so each ends up persisted as its
/// own `MessageContent::ToolCall` message. Left as-is, replaying that history
/// converts to consecutive `rig::message::Message::Assistant` entries — which
/// violates providers' requirement that a tool-calling assistant message be
/// immediately followed by the matching tool responses. Merging them back
/// into one assistant message (with all of that turn's tool calls) restores
/// the shape the provider expects.
fn merge_consecutive_assistant_messages(
    messages: Vec<rig::message::Message>,
) -> Vec<rig::message::Message> {
    let mut merged: Vec<rig::message::Message> = Vec::with_capacity(messages.len());

    for message in messages {
        if let (Some(rig::message::Message::Assistant { content: prev, .. }), true) = (
            merged.last_mut(),
            matches!(message, rig::message::Message::Assistant { .. }),
        ) {
            let rig::message::Message::Assistant { content, .. } = message else {
                unreachable!()
            };
            for item in content {
                prev.push(item);
            }
        } else {
            merged.push(message);
        }
    }

    merged
}

#[cfg(test)]
pub mod tests {
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository;
    use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
    use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
    use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

    use injector::{injector::Injector, register_scope};
    use rig::{
        completion::{CompletionError, CompletionResponse, Usage},
        message::{AssistantContent, Message as RigMessage, UserContent},
        streaming::RawStreamingChoice,
    };

    use crate::{
        ai_integration::{
            ai_state::AiState,
            clients::mock_client::{MOCK_PROVIDER, MockClient},
            entities::{
                chat::Chat,
                message::{ApprovalStatus, MessageContent},
            },
            json_schemas::generate_title::GenerateTitle,
            repositories::ai_repository::AiRepository,
            services::{
                agent_provider::AgentProvider,
                ai_client_provider::AiClientProvider,
                ai_streamer::{AiStreamer, StreamLlmResponseEvent},
                chat_creator::ChatCreator,
                implementations::{
                    default_agent_provider::DefaultAgentProvider,
                    default_ai_client_provider::DefaultAiClientProvider,
                    default_chat_creator::DefaultChatCreator,
                    default_tool_approval_resolver::DefaultToolApprovalResolver,
                    default_tools_provider::DefaultToolsProvider,
                },
                tools_provider::ToolsProvider,
            },
        },
        bibliographical_sources::{
            repositories::bibliographical_source_repository::BibliographicalSourceRepository,
            services::{
                bibliographical_source_service::BibliographicalSourceService,
                implementations::default_bibliographical_source_service::DefaultBibliographicalSourceService,
            },
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
                element_creation_service::ElementCreationService,
                element_index_service::ElementIndexService, priority_service::PriorityService,
            },
        },
        infrastructure::managers::sqlite::sqlite_transaction_manager::SqliteTransactionManager,
        infrastructure::repositories::{
            disk::disk_settings_repository::DiskSettingsRepository,
            sqlite::{
                sqlite_ai_repository::SqliteAiRepository,
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
    use tokio::sync::Mutex;

    use crate::common::services::lexical_json_converter::{
        LexicalJsonConverter, LexicalJsonConverterError,
    };

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

    async fn initialize_test_injector(mock_client: MockClient, state: Arc<AiState>) -> Injector {
        let mut injector = create_test_injector().await;

        let mut settings = Settings::new(create_temp_directory().await, SettingsProfile::Default);
        settings.enable_ai = true;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton(Arc::new(mock_client));
        injector.register_singleton(state);
        injector.register_singleton::<dyn LexicalJsonConverter>(Arc::new(MockLexicalJsonConverter));

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);
        register_scope!(injector, dyn ChatCreator, DefaultChatCreator);
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
        register_scope!(injector, dyn AgentProvider, DefaultAgentProvider);
        register_scope!(injector, dyn TransactionManager, SqliteTransactionManager);
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
        register_scope!(
            injector,
            dyn ToolApprovalResolver,
            DefaultToolApprovalResolver
        );
        register_scope!(injector, dyn AiStreamer, DefaultAiStreamer);

        injector
    }

    #[tokio::test]
    pub async fn stream_new_chat_created_new_chat_and_added_messages() {
        // Arrange

        let sent_stream_answer = AtomicBool::new(false);

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User message: User prompt"
                {
                    let tool_call = AssistantContent::tool_call(
                        "id",
                        "submit",
                        serde_json::to_value(GenerateTitle {
                            title: "Chat title".to_string(),
                        })
                        .unwrap(),
                    );
                    return CompletionResponse::new(
                        vec![tool_call],
                        Usage::default(),
                        MOCK_PROVIDER,
                    );
                }

                panic!()
            }))),
            stream_fn: Arc::new(Some(Box::new(move |request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User prompt"
                    && !sent_stream_answer.load(Ordering::Relaxed)
                {
                    sent_stream_answer.store(true, Ordering::Relaxed);
                    return Ok(Some(RawStreamingChoice::Message("Bot answer".to_string())));
                }

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let received_create_chat = Arc::new(AtomicBool::new(false));
        let received_in_progress = Arc::new(AtomicBool::new(false));

        // Clone before moving into closure
        let received_create_chat_clone = Arc::clone(&received_create_chat);
        let received_in_progress_clone = Arc::clone(&received_in_progress);

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            ..Default::default()
        };

        // Act

        service
            .stream(
                request,
                Arc::new(move |event| {
                    match event {
                        StreamLlmResponseEvent::CreatedChat(chat) => {
                            received_create_chat_clone
                                .store(chat.title() == "Chat title", Ordering::Relaxed);
                        }
                        StreamLlmResponseEvent::InProgress { text, .. } => {
                            received_in_progress_clone
                                .store(text == "Bot answer", Ordering::Relaxed);
                        }
                        _ => (),
                    }
                    Ok(())
                }),
            )
            .await
            .unwrap();

        // Assert

        assert!(received_create_chat.load(Ordering::Relaxed));
        assert!(received_in_progress.load(Ordering::Relaxed));

        let chats = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        assert_eq!(1, chats.len());
        assert_eq!("Chat title", chats[0].0.title());

        let messages = repository
            .get_chat_messages_ordered(chats[0].0.id())
            .await
            .unwrap();
        assert_eq!(2, messages.len());

        assert_eq!(
            MessageContent::Human("User prompt".to_string()),
            *messages[0].content()
        );

        assert_eq!(
            MessageContent::Assistant("Bot answer".to_string()),
            *messages[1].content()
        );
    }

    #[tokio::test]
    pub async fn stream_new_prompt_resent_prior_message_context_snippets_to_the_ai() {
        // Arrange

        let resent_context = Arc::new(AtomicBool::new(false));
        let resent_context_clone = resent_context.clone();

        let mock_client = MockClient {
            stream_fn: Arc::new(Some(Box::new(move |request| {
                let has_context = request.chat_history.iter().any(|message| {
                    matches!(
                        message,
                        RigMessage::User { content }
                            if content.iter().any(|c| matches!(
                                c,
                                UserContent::Text(text) if text.text.contains("Prior selected passage")
                            ))
                    )
                });
                resent_context_clone.store(has_context, Ordering::Relaxed);

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();
        let earlier_message = Message::new(
            None,
            chat_id,
            MessageContent::Human("Earlier prompt".to_string()),
        );
        repository.upsert_message(&earlier_message).await.unwrap();
        repository
            .upsert_context_snippet(&ContextSnippet::new(
                None,
                earlier_message.id(),
                "Prior selected passage".to_string(),
                0,
            ))
            .await
            .unwrap();

        let request = StreamAiRequestDto {
            prompt: "Follow-up prompt".to_string(),
            chat_id: Some(chat_id),
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        assert!(resent_context.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn stream_new_prompt_with_context_snippets_attached_them_to_the_prompt_not_the_preamble()
     {
        // Arrange

        let attached_to_prompt = Arc::new(AtomicBool::new(false));
        let attached_to_prompt_clone = attached_to_prompt.clone();
        let in_preamble = Arc::new(AtomicBool::new(true));
        let in_preamble_clone = in_preamble.clone();

        let mock_client = MockClient {
            stream_fn: Arc::new(Some(Box::new(move |request| {
                let prompt_has_snippet = matches!(
                    request.chat_history.last(),
                    Some(RigMessage::User { content })
                        if content.iter().any(|c| matches!(
                            c,
                            UserContent::Text(text)
                                if text.text.contains("Follow-up prompt")
                                    && text.text.contains("New selected passage")
                        ))
                );
                attached_to_prompt_clone.store(prompt_has_snippet, Ordering::Relaxed);
                let preamble_has_snippet = request.preamble.as_deref().is_some_and(|p| p.contains("New selected passage"))
                    || request.chat_history.iter().any(|message| {
                        matches!(
                            message,
                            RigMessage::System { content } if content.contains("New selected passage")
                        )
                    });
                in_preamble_clone.store(preamble_has_snippet, Ordering::Relaxed);

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();

        let request = StreamAiRequestDto {
            prompt: "Follow-up prompt".to_string(),
            chat_id: Some(chat_id),
            context_snippets: vec!["New selected passage".to_string()],
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        assert!(attached_to_prompt.load(Ordering::Relaxed));
        assert!(!in_preamble.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn stream_added_search_documents_tool_when_streaming() {
        // Arrange

        let valid_request = Arc::new(AtomicBool::new(false));
        let valid_request_clone = valid_request.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|_| {
                let tool_call = AssistantContent::tool_call(
                    "id",
                    "submit",
                    serde_json::to_value(GenerateTitle {
                        title: "Chat title".to_string(),
                    })
                    .unwrap(),
                );
                CompletionResponse::new(vec![tool_call], Usage::default(), MOCK_PROVIDER)
            }))),
            stream_fn: Arc::new(Some(Box::new(move |request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User prompt"
                    // search_documents plus the always-on create_card tool.
                    && request.tools.len() == 2
                    && request.tools.iter().any(|tool| tool.name == "search_documents")
                    && request.tools.iter().any(|tool| tool.name == "create_card")
                {
                    valid_request_clone.store(true, Ordering::Relaxed);
                }

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();
        repository
            .upsert_message(&Message::new(
                None,
                chat_id,
                MessageContent::Document(
                    crate::ai_integration::entities::message::DocumentContent {
                        file_name: "file.pdf".to_string(),
                    },
                ),
            ))
            .await
            .unwrap();

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            chat_id: Some(chat_id),
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        assert!(valid_request.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn stream_cancelled_response_stopped_generation() {
        // Arrange

        let last_sent_message = Arc::new(AtomicU32::new(1));
        let ai_state = Arc::new(AiState::default());
        let ai_state_clone = ai_state.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User message: User prompt"
                {
                    let tool_call = AssistantContent::tool_call(
                        "id",
                        "submit",
                        serde_json::to_value(GenerateTitle {
                            title: "Chat title".to_string(),
                        })
                        .unwrap(),
                    );
                    return CompletionResponse::new(
                        vec![tool_call],
                        Usage::default(),
                        MOCK_PROVIDER,
                    );
                }

                panic!()
            }))),
            stream_fn: Arc::new(Some(Box::new(move |request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User prompt"
                {
                    let current = last_sent_message.load(Ordering::Relaxed);
                    if current > 3 {
                        ai_state_clone.cancel_generation();
                    }
                    last_sent_message.store(current + 1, Ordering::Relaxed);
                    return Ok(Some(RawStreamingChoice::Message(current.to_string())));
                }

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, ai_state).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        let chats = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        let messages = repository
            .get_chat_messages_ordered(chats[0].0.id())
            .await
            .unwrap();
        assert_eq!(
            MessageContent::Assistant("123".to_string()),
            *messages[1].content()
        );
    }

    #[tokio::test]
    pub async fn stream_cancelled_during_title_generation_stopped_without_error_or_chat() {
        // Arrange

        let ai_state = Arc::new(AiState::default());
        let ai_state_clone = ai_state.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(move |request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User message: User prompt"
                {
                    ai_state_clone.cancel_generation();

                    let tool_call = AssistantContent::tool_call(
                        "id",
                        "submit",
                        serde_json::to_value(GenerateTitle {
                            title: "Chat title".to_string(),
                        })
                        .unwrap(),
                    );
                    return CompletionResponse::new(
                        vec![tool_call],
                        Usage::default(),
                        MOCK_PROVIDER,
                    );
                }

                panic!()
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, ai_state).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let received_event = Arc::new(AtomicBool::new(false));
        let received_event_clone = received_event.clone();

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            ..Default::default()
        };

        // Act

        let result = service
            .stream(
                request,
                Arc::new(move |_| {
                    received_event_clone.store(true, Ordering::Relaxed);
                    Ok(())
                }),
            )
            .await;

        // Assert

        assert!(result.is_ok());
        assert!(!received_event.load(Ordering::Relaxed));

        let chats = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        assert!(chats.is_empty());
    }

    #[tokio::test]
    pub async fn stream_error_during_stream_called_correct_event_and_saved_only_the_chat() {
        // Arrange

        let sent_stream_answer = AtomicBool::new(false);

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User message: User prompt"
                {
                    let tool_call = AssistantContent::tool_call(
                        "id",
                        "submit",
                        serde_json::to_value(GenerateTitle {
                            title: "Chat title".to_string(),
                        })
                        .unwrap(),
                    );
                    return CompletionResponse::new(
                        vec![tool_call],
                        Usage::default(),
                        MOCK_PROVIDER,
                    );
                }

                panic!()
            }))),
            stream_fn: Arc::new(Some(Box::new(move |request| {
                if let Some(RigMessage::User { content }) = request.chat_history.last()
                    && let Some(UserContent::Text(text)) = content.last()
                    && text.text() == "User prompt"
                {
                    if sent_stream_answer.load(Ordering::Relaxed) {
                        // Fail on second time.
                        return Err(CompletionError::ResponseError("error from AI".to_string()));
                    } else {
                        sent_stream_answer.store(true, Ordering::Relaxed);
                        return Ok(Some(RawStreamingChoice::Message("Bot answer".to_string())));
                    }
                }

                Ok(None)
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let received_error = Arc::new(AtomicBool::new(false));
        let received_error_clone = received_error.clone();

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            ..Default::default()
        };

        // Act

        service
            .stream(
                request,
                Arc::new(move |event| {
                    if let StreamLlmResponseEvent::Error(error) = event {
                        received_error_clone
                            .store(error == "ResponseError: error from AI", Ordering::Relaxed);
                    }
                    Ok(())
                }),
            )
            .await
            .unwrap();

        // Assert

        assert!(received_error.load(Ordering::Relaxed));

        let chats = repository
            .get_all_chats_sorted_by_last_activity_desc()
            .await
            .unwrap();
        assert_eq!(1, chats.len());

        let messages = repository
            .get_chat_messages_ordered(chats[0].0.id())
            .await
            .unwrap();
        assert!(messages.is_empty());
    }

    #[tokio::test]
    pub async fn stream_error_in_existing_chat_did_not_save_prompt_or_snippets() {
        // Arrange

        let mock_client = MockClient {
            stream_fn: Arc::new(Some(Box::new(|_| {
                Err(CompletionError::ResponseError("error from AI".to_string()))
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();
        let earlier_message = Message::new(
            None,
            chat_id,
            MessageContent::Human("Earlier prompt".to_string()),
        );
        repository.upsert_message(&earlier_message).await.unwrap();

        let request = StreamAiRequestDto {
            prompt: "Follow-up prompt".to_string(),
            chat_id: Some(chat_id),
            context_snippets: vec!["Selected passage".to_string()],
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        let messages = repository.get_chat_messages_ordered(chat_id).await.unwrap();
        assert_eq!(
            vec![earlier_message.id()],
            messages.iter().map(|m| m.id()).collect::<Vec<_>>()
        );
        assert!(
            repository
                .get_context_snippets_for_chat(chat_id)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    pub async fn stream_tool_call_saves_tool_call_and_tool_result_messages() {
        // Arrange

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|_| {
                let tool_call = AssistantContent::tool_call(
                    "id",
                    "submit",
                    serde_json::to_value(GenerateTitle {
                        title: "Chat title".to_string(),
                    })
                    .unwrap(),
                );
                CompletionResponse::new(vec![tool_call], Usage::default(), MOCK_PROVIDER)
            }))),
            stream_fn: Arc::new(Some(Box::new(move |_| {
                match call_count_clone.fetch_add(1, Ordering::Relaxed) {
                    0 => Ok(Some(RawStreamingChoice::ToolCall(
                        rig::streaming::RawStreamingToolCall::new(
                            "tc-1".to_string(),
                            "search_documents".to_string(),
                            serde_json::json!({ "query": "test", "top_k": 3 }),
                        ),
                    ))),
                    2 => Ok(Some(RawStreamingChoice::Message(
                        "Final answer".to_string(),
                    ))),
                    _ => Ok(None),
                }
            }))),
            embeddings_model_dims: Some(
                crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS,
            ),
            embed_texts_fn: Arc::new(Some(Box::new(|texts| {
                Ok(texts
                    .into_iter()
                    .map(|text| rig::embeddings::Embedding {
                        document: text,
                        vec: vec![
                            0f64;
                            crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS
                        ],
                    })
                    .collect())
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();
        repository
            .upsert_message(&Message::new(
                None,
                chat_id,
                MessageContent::Document(
                    crate::ai_integration::entities::message::DocumentContent {
                        file_name: "file.pdf".to_string(),
                    },
                ),
            ))
            .await
            .unwrap();

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            chat_id: Some(chat_id),
            ..Default::default()
        };

        // Act

        service
            .stream(request, Arc::new(move |_| Ok(())))
            .await
            .unwrap();

        // Assert

        let messages = repository.get_chat_messages_ordered(chat_id).await.unwrap();

        assert_eq!(5, messages.len());
        assert!(matches!(messages[0].content(), MessageContent::Document(_)));
        assert!(matches!(messages[1].content(), MessageContent::Human(_)));
        assert!(matches!(messages[2].content(), MessageContent::ToolCall(_)));
        assert!(matches!(
            messages[3].content(),
            MessageContent::ToolResult(_)
        ));
        assert!(matches!(
            messages[4].content(),
            MessageContent::Assistant(_)
        ));

        if let (MessageContent::ToolCall(tc), MessageContent::ToolResult(tr)) =
            (messages[2].content(), messages[3].content())
        {
            assert_eq!(tc.id, tr.id);
            assert_eq!(tc.name, "search_documents");
        } else {
            panic!("Expected ToolCall and ToolResult messages");
        }
    }

    #[tokio::test]
    pub async fn stream_approval_required_tool_call_persisted_pending_approval_under_emitted_message_id()
     {
        // Arrange

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let mock_client = MockClient {
            stream_fn: Arc::new(Some(Box::new(move |_| {
                match call_count_clone.fetch_add(1, Ordering::Relaxed) {
                    0 => Ok(Some(RawStreamingChoice::ToolCall(
                        rig::streaming::RawStreamingToolCall::new(
                            "tc-1".to_string(),
                            "create_card".to_string(),
                            serde_json::json!({ "front": "Q", "back": "A" }),
                        ),
                    ))),
                    2 => Ok(Some(RawStreamingChoice::Message("Done".to_string()))),
                    _ => Ok(None),
                }
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();

        let request = StreamAiRequestDto {
            prompt: "Make a card".to_string(),
            chat_id: Some(chat_id),
            ..Default::default()
        };

        let emitted_message_id = Arc::new(std::sync::Mutex::new(None));
        let emitted_message_id_clone = emitted_message_id.clone();

        // Act

        service
            .stream(
                request,
                Arc::new(move |event| {
                    if let StreamLlmResponseEvent::ToolCall {
                        message_id,
                        approval_markdown,
                        ..
                    } = event
                    {
                        *emitted_message_id_clone.lock().unwrap() =
                            Some((message_id, approval_markdown));
                    }
                    Ok(())
                }),
            )
            .await
            .unwrap();

        // Assert

        let (message_id, approval_markdown) = emitted_message_id.lock().unwrap().take().unwrap();
        assert_eq!(
            Some("**Front**\n\nQ\n\n---\n\n**Back**\n\nA".to_string()),
            approval_markdown
        );
        let message = repository.get_message_by_id(message_id).await.unwrap();
        let MessageContent::ToolCall(tool_call) = message.content() else {
            panic!("Expected a tool call message");
        };
        assert_eq!(
            Some(ToolApproval::pending(serde_json::json!({
                "chatId": chat_id,
                "elementId": null,
            }))),
            tool_call.approval
        );
        assert!(card_repository.get_all().await.unwrap().is_empty());
    }

    #[test]
    fn with_current_approval_statuses_approved_call_rewrote_its_tool_result_to_its_output() {
        // Arrange

        let chat_id = Uuid::new_v4();
        let messages = vec![
            Message::new(
                None,
                chat_id,
                MessageContent::ToolCall(ToolCallContent {
                    id: "tc-1".to_string(),
                    name: "create_card".to_string(),
                    arguments: serde_json::json!({}),
                    approval: Some(ToolApproval {
                        context: serde_json::Value::Null,
                        status: ApprovalStatus::Approved,
                        output: Some("Card created.".to_string()),
                    }),
                }),
            ),
            Message::new(
                None,
                chat_id,
                MessageContent::ToolResult(ToolResultContent {
                    id: "tc-1".to_string(),
                    name: "create_card".to_string(),
                    text: approval_result_text(ApprovalStatus::Pending, None),
                }),
            ),
        ];

        // Act

        let actual = with_current_approval_statuses(messages);

        // Assert

        let MessageContent::ToolResult(result) = actual[1].content() else {
            panic!("Expected a tool result message");
        };
        assert_eq!(
            approval_result_text(ApprovalStatus::Approved, Some("Card created.")),
            result.text
        );
    }

    #[tokio::test]
    pub async fn stream_tool_call_emitted_tool_call_and_tool_result_events_while_streaming() {
        // Arrange

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|_| {
                let tool_call = AssistantContent::tool_call(
                    "id",
                    "submit",
                    serde_json::to_value(GenerateTitle {
                        title: "Chat title".to_string(),
                    })
                    .unwrap(),
                );
                CompletionResponse::new(vec![tool_call], Usage::default(), MOCK_PROVIDER)
            }))),
            stream_fn: Arc::new(Some(Box::new(move |_| {
                match call_count_clone.fetch_add(1, Ordering::Relaxed) {
                    0 => Ok(Some(RawStreamingChoice::ToolCall(
                        rig::streaming::RawStreamingToolCall::new(
                            "tc-1".to_string(),
                            "search_documents".to_string(),
                            serde_json::json!({ "query": "test", "top_k": 3 }),
                        ),
                    ))),
                    2 => Ok(Some(RawStreamingChoice::Message(
                        "Final answer".to_string(),
                    ))),
                    _ => Ok(None),
                }
            }))),
            embeddings_model_dims: Some(
                crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS,
            ),
            embed_texts_fn: Arc::new(Some(Box::new(|texts| {
                Ok(texts
                    .into_iter()
                    .map(|text| rig::embeddings::Embedding {
                        document: text,
                        vec: vec![
                            0f64;
                            crate::ai_integration::clients::mock_client::DEFAULT_MOCK_EMBEDDINGS_DIMS
                        ],
                    })
                    .collect())
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiStreamer>().await;
        let repository = scope.resolve::<dyn AiRepository>().await;

        let chat = Chat::new(None, "Chat title".to_string());
        let chat_id = chat.id();
        repository.upsert_chat(&chat).await.unwrap();
        repository
            .upsert_message(&Message::new(
                None,
                chat_id,
                MessageContent::Document(
                    crate::ai_integration::entities::message::DocumentContent {
                        file_name: "file.pdf".to_string(),
                    },
                ),
            ))
            .await
            .unwrap();

        let request = StreamAiRequestDto {
            prompt: "User prompt".to_string(),
            chat_id: Some(chat_id),
            ..Default::default()
        };

        let received_events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let received_events_clone = received_events.clone();

        // Act

        service
            .stream(
                request,
                Arc::new(move |event| {
                    if matches!(
                        event,
                        StreamLlmResponseEvent::ToolCall { .. }
                            | StreamLlmResponseEvent::ToolResult { .. }
                    ) {
                        received_events_clone.lock().unwrap().push(event);
                    }
                    Ok(())
                }),
            )
            .await
            .unwrap();

        // Assert

        let received_events = received_events.lock().unwrap();
        assert_eq!(2, received_events.len());
        assert!(matches!(
            received_events[0],
            StreamLlmResponseEvent::ToolCall { .. }
        ));
        assert!(matches!(
            received_events[1],
            StreamLlmResponseEvent::ToolResult { .. }
        ));

        if let (
            StreamLlmResponseEvent::ToolCall { tool_call, .. },
            StreamLlmResponseEvent::ToolResult { tool_result, .. },
        ) = (&received_events[0], &received_events[1])
        {
            assert_eq!(tool_call.id, tool_result.id);
            assert_eq!(tool_call.name, "search_documents");
        } else {
            unreachable!();
        }
    }

    #[test]
    fn merge_consecutive_assistant_messages_multiple_tool_calls_merged_into_one_assistant_message()
    {
        // Arrange

        let messages = vec![
            RigMessage::User {
                content: vec![UserContent::text("Make three cards")],
            },
            RigMessage::Assistant {
                id: None,
                content: vec![AssistantContent::tool_call(
                    "call-1",
                    "create_card",
                    serde_json::json!({}),
                )],
            },
            RigMessage::Assistant {
                id: None,
                content: vec![AssistantContent::tool_call(
                    "call-2",
                    "create_card",
                    serde_json::json!({}),
                )],
            },
            RigMessage::Assistant {
                id: None,
                content: vec![AssistantContent::tool_call(
                    "call-3",
                    "create_card",
                    serde_json::json!({}),
                )],
            },
            RigMessage::User {
                content: vec![UserContent::tool_result(
                    "call-1",
                    "create_card",
                    vec![rig::message::ToolResultContent::text("ok")],
                )],
            },
            RigMessage::User {
                content: vec![UserContent::tool_result(
                    "call-2",
                    "create_card",
                    vec![rig::message::ToolResultContent::text("ok")],
                )],
            },
            RigMessage::User {
                content: vec![UserContent::tool_result(
                    "call-3",
                    "create_card",
                    vec![rig::message::ToolResultContent::text("ok")],
                )],
            },
        ];

        // Act

        let actual = merge_consecutive_assistant_messages(messages);

        // Assert

        assert_eq!(5, actual.len());
        let RigMessage::Assistant { content, .. } = &actual[1] else {
            panic!("Expected an assistant message");
        };
        assert_eq!(3, content.len());
        for (item, expected_id) in content.iter().zip(["call-1", "call-2", "call-3"]) {
            let AssistantContent::ToolCall(tool_call) = item else {
                panic!("Expected a tool call");
            };
            assert_eq!(expected_id, tool_call.id.as_str());
        }
    }

    #[test]
    fn merge_consecutive_assistant_messages_no_consecutive_assistants_left_messages_unchanged() {
        // Arrange

        let messages = vec![
            RigMessage::User {
                content: vec![UserContent::text("Hi")],
            },
            RigMessage::Assistant {
                id: None,
                content: vec![AssistantContent::text("Hello")],
            },
        ];

        // Act

        let actual = merge_consecutive_assistant_messages(messages.clone());

        // Assert

        assert_eq!(messages, actual);
    }
}
