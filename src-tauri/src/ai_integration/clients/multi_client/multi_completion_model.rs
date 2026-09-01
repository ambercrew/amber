use rig::completion::{CompletionError, CompletionModel, CompletionRequest, CompletionResponse};
use rig::streaming::StreamingCompletionResponse;

#[cfg(not(test))]
use rig::providers::{ollama, openai};

#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;

/// Used for enum dispatching from multiple models.
#[derive(Clone)]
pub enum MultiCompletionModel {
    #[cfg(not(test))]
    Ollama(ollama::CompletionModel),
    #[cfg(not(test))]
    OpenAI(openai::CompletionModel),
    #[cfg(test)]
    Mock(MockClient),
}

impl CompletionModel for MultiCompletionModel {
    async fn completion(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse, CompletionError> {
        match self {
            #[cfg(not(test))]
            Self::Ollama(completion_model) => completion_model.completion(request).await,
            #[cfg(not(test))]
            Self::OpenAI(completion_model) => completion_model.completion(request).await,
            #[cfg(test)]
            Self::Mock(completion_model) => completion_model.completion(request).await,
        }
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse, CompletionError> {
        match self {
            #[cfg(not(test))]
            Self::Ollama(completion_model) => completion_model.stream(request).await,
            #[cfg(not(test))]
            Self::OpenAI(completion_model) => completion_model.stream(request).await,
            #[cfg(test)]
            Self::Mock(completion_model) => completion_model.stream(request).await,
        }
    }

    fn capabilities(&self) -> rig::completion::ProviderCapabilities {
        match self {
            #[cfg(not(test))]
            Self::Ollama(completion_model) => completion_model.capabilities(),
            #[cfg(not(test))]
            Self::OpenAI(completion_model) => completion_model.capabilities(),
            #[cfg(test)]
            Self::Mock(completion_model) => completion_model.capabilities(),
        }
    }
}
