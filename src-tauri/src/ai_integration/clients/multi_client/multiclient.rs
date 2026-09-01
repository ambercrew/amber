use rig::client::{CompletionClient, EmbeddingsClient};

#[cfg(not(test))]
use rig::providers::ollama;
#[cfg(not(test))]
use rig::providers::openai;

#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;
use crate::ai_integration::clients::multi_client::{
    multi_completion_model::MultiCompletionModel, multi_embedding_model::MultiEmbeddingModel,
};

/// Used for enum dispatching from multiple models.
pub enum MultiClient {
    #[cfg(not(test))]
    Ollama(ollama::Client),
    #[cfg(not(test))]
    OpenAI(openai::CompletionsClient),
    #[cfg(test)]
    Mock(MockClient),
}

impl CompletionClient for MultiClient {
    type CompletionModel = MultiCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        match self {
            #[cfg(not(test))]
            MultiClient::Ollama(client) => {
                MultiCompletionModel::Ollama(client.completion_model(model))
            }
            #[cfg(not(test))]
            MultiClient::OpenAI(client) => {
                MultiCompletionModel::OpenAI(client.completion_model(model))
            }
            #[cfg(test)]
            MultiClient::Mock(client) => {
                let mut client = client.clone();
                client.model = Some(model.into());
                MultiCompletionModel::Mock(client)
            }
        }
    }
}

impl EmbeddingsClient for MultiClient {
    type EmbeddingModel = MultiEmbeddingModel;

    fn embedding_model(&self, model: impl Into<String>) -> Self::EmbeddingModel {
        match self {
            #[cfg(not(test))]
            MultiClient::Ollama(client) => {
                MultiEmbeddingModel::Ollama(client.embedding_model(model))
            }
            #[cfg(not(test))]
            MultiClient::OpenAI(client) => {
                MultiEmbeddingModel::OpenAI(client.embedding_model(model))
            }
            #[cfg(test)]
            MultiClient::Mock(client) => {
                let mut client = client.clone();
                client.embeddings_model = Some(model.into());
                MultiEmbeddingModel::Mock(client)
            }
        }
    }

    fn embedding_model_with_ndims(
        &self,
        model: impl Into<String>,
        ndims: usize,
    ) -> Self::EmbeddingModel {
        match self {
            #[cfg(not(test))]
            MultiClient::Ollama(client) => {
                MultiEmbeddingModel::Ollama(client.embedding_model_with_ndims(model, ndims))
            }
            #[cfg(not(test))]
            MultiClient::OpenAI(client) => {
                MultiEmbeddingModel::OpenAI(client.embedding_model_with_ndims(model, ndims))
            }
            #[cfg(test)]
            MultiClient::Mock(client) => {
                let mut client = client.clone();
                client.embeddings_model_dims = Some(ndims);
                client.embeddings_model = Some(model.into());
                MultiEmbeddingModel::Mock(client)
            }
        }
    }
}
