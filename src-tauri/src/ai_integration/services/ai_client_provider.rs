use async_trait::async_trait;
use rig::ProviderError;
use rig::sqlite::SqliteVectorStore;
use rig::vector_store::VectorStoreError;
use thiserror::Error;

use crate::SourceError;
use crate::ai_integration::clients::multi_client::{EmbeddingModel, MultiClient};
use crate::ai_integration::entities::document::Document;
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
    #[error("{0} embeddings model name is not set in settings!")]
    EmbeddingsModelNameIsNotFilled(AiProvider),
    #[cfg(not(test))]
    #[error("{0} API key is not set in settings!")]
    ApiKeyNotSet(AiProvider),
    #[error("Failed to connect to the embeddings database")]
    ConnectingToEmbeddingsDatabase(#[source] SourceError),
    #[error(transparent)]
    VectorStore(Box<VectorStoreError>),
    #[error("Failed to create vector store directory.")]
    CreateVectorStoreDirectory(#[source] SourceError),
    #[error("Failed to determine the embedding model's dimensions")]
    DetectEmbeddingDimensions(#[source] Box<ProviderError>),
    #[error("Cancelled due to state update.")]
    Cancelled,
}

// rig's errors are large, so they're boxed to keep every result small.
impl From<VectorStoreError> for AiClientProviderError {
    fn from(error: VectorStoreError) -> Self {
        Self::VectorStore(Box::new(error))
    }
}

impl From<ProviderError> for AiClientProviderError {
    fn from(error: ProviderError) -> Self {
        Self::DetectEmbeddingDimensions(Box::new(error))
    }
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
    ) -> Result<EmbeddingModel, AiClientProviderError>;
    async fn get_vector_store(
        &self,
        embed_model: &EmbeddingModel,
    ) -> Result<SqliteVectorStore<Document>, AiClientProviderError>;
}
