use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::client::AgentClientExt;
use rig::completion::PromptError;
use rig::extractor::ExtractionError;

use crate::ai_integration::ai_state::AiState;
use crate::ai_integration::entities::chat::Chat;
use crate::ai_integration::json_schemas::generate_title::GenerateTitle;
use crate::ai_integration::prompts::PREAMBLE_GENERATE_TITLE;
use crate::ai_integration::services::ai_client_provider::AiClientProvider;
use crate::ai_integration::services::chat_creator::{ChatCreator, ChatCreatorError};
use crate::ai_integration::state_cancellation_hook::StateCancellationHook;

#[derive(ScopeInjectable)]
pub struct DefaultChatCreator {
    ai_client_provider: Arc<dyn AiClientProvider>,
    state: Arc<AiState>,
}

#[async_trait]
impl ChatCreator for DefaultChatCreator {
    async fn create_chat(&self, prompt: &str) -> Result<Chat, ChatCreatorError> {
        let response = match self
            .ai_client_provider
            .get_client()
            .await?
            .extractor::<GenerateTitle>(self.ai_client_provider.get_completion_model_name().await?)
            .preamble(PREAMBLE_GENERATE_TITLE)
            .add_hook(StateCancellationHook::new(self.state.clone()))
            .build()
            .extract(format!("User message: {}", prompt))
            .await
        {
            Ok(response) => response,
            Err(ExtractionError::CompletionError(completion_err)) => {
                return Err(ChatCreatorError::try_from(completion_err)
                    .unwrap_or_else(|e| ChatCreatorError::CreateChat(Box::new(e))));
            }
            Err(ExtractionError::PromptError(PromptError::PromptCancelled { .. })) => {
                return Err(ChatCreatorError::Cancelled);
            }
            Err(err) => return Err(ChatCreatorError::CreateChat(Box::new(err))),
        };

        log::info!("Generated title for chat is '{}'.", response.title);
        Ok(Chat::new(None, response.title))
    }
}

#[cfg(test)]
pub mod tests {
    use injector::{injector::Injector, register_scope};
    use rig::{
        completion::{CompletionResponse, Usage},
        message::{AssistantContent, Message as RigMessage, UserContent},
    };
    use tokio::sync::Mutex;

    use crate::{
        ai_integration::{
            clients::mock_client::{MOCK_PROVIDER, MockClient},
            services::implementations::default_ai_client_provider::DefaultAiClientProvider,
        },
        infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository,
        settings::{
            entities::settings::Settings, repositories::settings_repository::SettingsRepository,
            value_objects::settings_profile::SettingsProfile,
        },
        test_utils::{create_temp_directory, create_test_injector},
    };

    use super::*;

    async fn initialize_test_injector(mock_client: MockClient, state: Arc<AiState>) -> Injector {
        let mut injector = create_test_injector().await;

        let mut settings = Settings::new(create_temp_directory().await, SettingsProfile::Default);
        settings.enable_ai = true;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton(Arc::new(mock_client));
        injector.register_singleton(state);

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);
        register_scope!(injector, dyn ChatCreator, DefaultChatCreator);

        injector
    }

    #[tokio::test]
    pub async fn create_chat_valid_prompt_returned_chat_with_generated_title() {
        // Arrange

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
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ChatCreator>().await;

        // Act

        let chat = service.create_chat("User prompt").await.unwrap();

        // Assert

        assert_eq!("Chat title", chat.title());
    }

    #[tokio::test]
    pub async fn create_chat_cancelled_before_call_returned_cancelled_error() {
        // Arrange

        let mock_client = MockClient {
            completion_fn: Arc::new(Some(Box::new(|_| {
                panic!("Completion should not be called once the generation is cancelled")
            }))),
            ..Default::default()
        };

        let state = Arc::new(AiState::default());
        state.cancel_generation();

        let injector = initialize_test_injector(mock_client, state).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ChatCreator>().await;

        // Act

        let result = service.create_chat("User prompt").await;

        // Assert

        assert!(matches!(result, Err(ChatCreatorError::Cancelled)));
    }
}
