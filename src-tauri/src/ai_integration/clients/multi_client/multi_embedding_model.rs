use rig::embeddings::EmbeddingModel;

#[cfg(not(test))]
use rig::providers::ollama;
#[cfg(not(test))]
use rig::providers::openai::{GenericEmbeddingModel, OpenAICompletionsExt};
#[cfg(not(test))]
use rig::providers::openrouter;

#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;
use crate::ai_integration::clients::multi_client::MultiClient;

#[derive(Clone)]
pub enum MultiEmbeddingModel {
    #[cfg(not(test))]
    Ollama(ollama::EmbeddingModel),
    #[cfg(not(test))]
    OpenAI(GenericEmbeddingModel<OpenAICompletionsExt>),
    #[cfg(not(test))]
    OpenRouter(openrouter::EmbeddingModel),
    #[cfg(test)]
    Mock(MockClient),
}

impl EmbeddingModel for MultiEmbeddingModel {
    const MAX_DOCUMENTS: usize = 1024;

    type Client = MultiClient;

    fn make(client: &Self::Client, model: impl Into<String>, dims: Option<usize>) -> Self {
        match client {
            #[cfg(not(test))]
            MultiClient::Ollama(client) => {
                MultiEmbeddingModel::Ollama(ollama::EmbeddingModel::make(client, model, dims))
            }
            #[cfg(not(test))]
            MultiClient::OpenAI(client) => {
                MultiEmbeddingModel::OpenAI(GenericEmbeddingModel::<OpenAICompletionsExt>::new(
                    client.clone(),
                    model,
                    dims.unwrap_or(0),
                ))
            }
            #[cfg(not(test))]
            MultiClient::OpenRouter(client) => MultiEmbeddingModel::OpenRouter(
                openrouter::EmbeddingModel::make(client, model, dims),
            ),
            #[cfg(test)]
            MultiClient::Mock(client) => {
                MultiEmbeddingModel::Mock(<MockClient as EmbeddingModel>::make(client, model, dims))
            }
        }
    }

    fn ndims(&self) -> usize {
        match self {
            #[cfg(not(test))]
            Self::Ollama(embedding_model) => embedding_model.ndims(),
            #[cfg(not(test))]
            Self::OpenAI(embedding_model) => embedding_model.ndims(),
            #[cfg(not(test))]
            Self::OpenRouter(embedding_model) => embedding_model.ndims(),
            #[cfg(test)]
            MultiEmbeddingModel::Mock(embedding_model) => embedding_model.ndims(),
        }
    }

    async fn embed_texts(
        &self,
        texts: impl IntoIterator<Item = String> + rig::wasm_compat::WasmCompatSend,
    ) -> Result<Vec<rig::embeddings::Embedding>, rig::embeddings::EmbeddingError> {
        match self {
            #[cfg(not(test))]
            Self::Ollama(embedding_model) => embedding_model.embed_texts(texts).await,
            #[cfg(not(test))]
            Self::OpenAI(embedding_model) => embedding_model.embed_texts(texts).await,
            #[cfg(not(test))]
            Self::OpenRouter(embedding_model) => embedding_model.embed_texts(texts).await,
            #[cfg(test)]
            MultiEmbeddingModel::Mock(embedding_model) => embedding_model.embed_texts(texts).await,
        }
    }
}
