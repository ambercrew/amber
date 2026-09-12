use async_trait::async_trait;
use rig::embeddings::EmbeddingError;
use rig::sqlite::SqliteVectorStore;
use rig::vector_store::VectorStoreError;
use thiserror::Error;

use crate::SourceError;
use crate::ai_integration::clients::multi_client::MultiClient;
use crate::ai_integration::clients::multi_client::multi_embedding_model::MultiEmbeddingModel;
use crate::ai_integration::entities::document::Document;

#[derive(Error, Debug)]
pub enum AiClientProviderError {
    #[error("AI is not enabled in settings!")]
    AiNotEnabled,
    #[cfg(not(test))]
    #[error("Ollama model name is not set in settings!")]
    OllamaModelNameIsNotFilled,
    #[cfg(not(test))]
    #[error("Ollama embeddings model name is not set in settings!")]
    OllamaEmbeddingsModelNameIsNotFilled,
    #[cfg(not(test))]
    #[error("OpenAI API key is not set in settings!")]
    OpenAIApiKeyNotSet,
    #[cfg(not(test))]
    #[error("OpenAI model name is not set in settings!")]
    OpenAIModelNameIsNotFilled,
    #[cfg(not(test))]
    #[error("OpenAI embeddings model name is not set in settings!")]
    OpenAIEmbeddingsModelNameIsNotFilled,
    #[cfg(not(test))]
    #[error("OpenRouter API key is not set in settings!")]
    OpenRouterApiKeyNotSet,
    #[cfg(not(test))]
    #[error("OpenRouter model name is not set in settings!")]
    OpenRouterModelNameIsNotFilled,
    #[cfg(not(test))]
    #[error("OpenRouter embeddings model name is not set in settings!")]
    OpenRouterEmbeddingsModelNameIsNotFilled,
    #[error("Failed to connect to the embeddings database")]
    ConnectingToEmbeddingsDatabase(#[source] SourceError),
    #[error(transparent)]
    VectorStore(#[from] VectorStoreError),
    #[error("Failed to create vector store directory.")]
    CreateVectorStoreDirectory(#[source] SourceError),
    #[error("Failed to determine the embedding model's dimensions")]
    DetectEmbeddingDimensions(#[from] EmbeddingError),
    #[cfg(not(test))]
    #[error("Failed to create the client")]
    CreateClient,
    #[error("Cancelled due to state update.")]
    Cancelled,
}

#[async_trait]
pub trait AiClientProvider: Send + Sync {
    async fn get_client(&self) -> Result<MultiClient, AiClientProviderError>;
    async fn get_completion_model_name(&self) -> Result<String, AiClientProviderError>;
    async fn get_embeddings_model_name(&self) -> Result<String, AiClientProviderError>;
    /// Builds the embedding model for the configured provider, with its dimensions
    /// corrected to the model's real output size (some providers, e.g. Ollama, don't
    /// expose their models' dimensions, so this is detected via a probe embedding call).
    async fn get_embeddings_model(
        &self,
        client: &MultiClient,
    ) -> Result<MultiEmbeddingModel, AiClientProviderError>;
    async fn get_vector_store(
        &self,
        embed_model: &MultiEmbeddingModel,
    ) -> Result<SqliteVectorStore<MultiEmbeddingModel, Document>, AiClientProviderError>;
}
