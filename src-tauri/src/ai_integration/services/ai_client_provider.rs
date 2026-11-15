use async_trait::async_trait;
use thiserror::Error;

use crate::ai_integration::clients::multi_client::MultiClient;
#[cfg(not(test))]
use crate::settings::value_objects::ai_provider::AiProvider;

#[derive(Error, Debug)]
pub enum AiClientProviderError {
    #[error("AI is not enabled in settings!")]
    AiNotEnabled,
    #[cfg(not(test))]
    #[error("{0} model name is not set in settings!")]
    ModelNameIsNotFilled(AiProvider),
    #[cfg(not(test))]
    #[error("{0} API key is not set in settings!")]
    ApiKeyNotSet(AiProvider),
}

#[async_trait]
pub trait AiClientProvider: Send + Sync {
    async fn get_client(&self) -> Result<MultiClient, AiClientProviderError>;
    async fn get_completion_model_name(&self) -> Result<String, AiClientProviderError>;
}
