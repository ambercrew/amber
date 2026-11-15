use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;
use crate::ai_integration::clients::multi_client::MultiClient;
use crate::ai_integration::services::ai_client_provider::{
    AiClientProvider, AiClientProviderError,
};
use crate::secrets::repositories::secrets_repository::SecretsRepository;
use crate::settings::repositories::settings_repository::SettingsRepository;
#[cfg(not(test))]
use crate::settings::value_objects::ai_provider::AiProvider;

#[derive(ScopeInjectable)]
pub struct DefaultAiClientProvider {
    settings_repository: Arc<dyn SettingsRepository>,
    #[cfg_attr(test, allow(dead_code))]
    secrets_repository: Arc<dyn SecretsRepository>,
    #[cfg(test)]
    mock_client: Arc<MockClient>,
}

#[cfg(not(test))]
impl DefaultAiClientProvider {
    async fn get_api_key(&self, provider: AiProvider) -> Result<String, AiClientProviderError> {
        let secret = provider
            .api_key_secret()
            .ok_or(AiClientProviderError::ApiKeyNotSet(provider))?;
        self.secrets_repository
            .get_secret(secret)
            .await
            .filter(|key| !key.is_empty())
            .ok_or(AiClientProviderError::ApiKeyNotSet(provider))
    }
}

#[cfg(not(test))]
fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

#[async_trait]
impl AiClientProvider for DefaultAiClientProvider {
    async fn get_client(&self) -> Result<MultiClient, AiClientProviderError> {
        let settings = self.settings_repository.get_settings().await;
        if !settings.enable_ai {
            return Err(AiClientProviderError::AiNotEnabled);
        }

        #[cfg(test)]
        return Ok(MultiClient::Mock((*self.mock_client).clone()));

        #[cfg(not(test))]
        {
            let provider = settings.ai_provider;
            Ok(match provider {
                AiProvider::Ollama => MultiClient::ollama(),
                AiProvider::OpenAI => MultiClient::openai(self.get_api_key(provider).await?),
                AiProvider::OpenRouter => {
                    MultiClient::openrouter(self.get_api_key(provider).await?)
                }
                AiProvider::Gemini => MultiClient::gemini(self.get_api_key(provider).await?),
            })
        }
    }

    async fn get_completion_model_name(&self) -> Result<String, AiClientProviderError> {
        #[cfg(test)]
        return Ok(self.mock_client.model.clone().unwrap_or_default());

        #[cfg(not(test))]
        {
            let settings = self.settings_repository.get_settings().await;
            let provider = settings.ai_provider;
            let model_name = non_empty(settings.ai_provider_settings(provider).model_name)
                .ok_or(AiClientProviderError::ModelNameIsNotFilled(provider))?;
            log::info!("Using the {provider} model with name '{model_name}'.");
            Ok(model_name)
        }
    }
}
