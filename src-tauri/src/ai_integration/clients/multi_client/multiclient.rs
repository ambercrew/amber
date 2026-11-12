use rig::DynModel;
use rig::operation::{Completion, Embedding};

#[cfg(not(test))]
use rig::providers::{
    gemini::Gemini,
    ollama::Ollama,
    openai::{self, OpenAI},
    openrouter,
};

#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;

pub type EmbeddingModel = DynModel<Embedding>;

/// The client of the provider picked in settings, building its models.
pub enum MultiClient {
    #[cfg(not(test))]
    Ollama(Ollama),
    #[cfg(not(test))]
    OpenAI(OpenAI),
    /// OpenRouter speaks OpenAI's API, so it's an OpenAI client with its own dialect.
    #[cfg(not(test))]
    OpenRouter(openai::OpenAI),
    #[cfg(not(test))]
    Gemini(Gemini),
    #[cfg(test)]
    Mock(MockClient),
}

impl MultiClient {
    #[cfg(not(test))]
    pub fn ollama() -> Self {
        Self::Ollama(Ollama::new())
    }

    #[cfg(not(test))]
    pub fn openai(api_key: String) -> Self {
        Self::OpenAI(OpenAI::new(api_key))
    }

    #[cfg(not(test))]
    pub fn openrouter(api_key: String) -> Self {
        Self::OpenRouter(openrouter::new(api_key))
    }

    #[cfg(not(test))]
    pub fn gemini(api_key: String) -> Self {
        Self::Gemini(Gemini::new(api_key))
    }

    pub fn completion(&self, model: impl Into<String>) -> DynModel<Completion> {
        match self {
            // The native chat API, as `completion` is Ollama's OpenAI-compatible one.
            #[cfg(not(test))]
            Self::Ollama(client) => client.native_completion(model).erase(),
            #[cfg(not(test))]
            Self::OpenAI(client) => client.responses(model).erase(),
            #[cfg(not(test))]
            Self::OpenRouter(client) => client.completion(model).erase(),
            #[cfg(not(test))]
            Self::Gemini(client) => client.completion(model).erase(),
            #[cfg(test)]
            Self::Mock(client) => client.completion(model),
        }
    }

    /// `ndims` overrides the dimensions rig knows the model by, if it knows them at all.
    pub fn embedding(&self, model: impl Into<String>, ndims: Option<usize>) -> EmbeddingModel {
        match self {
            #[cfg(not(test))]
            Self::Ollama(client) => client.embedding(model, ndims).erase(),
            #[cfg(not(test))]
            Self::OpenAI(client) => client.embedding(model, ndims).erase(),
            #[cfg(not(test))]
            Self::OpenRouter(client) => client.embedding(model, ndims).erase(),
            #[cfg(not(test))]
            Self::Gemini(client) => client.embedding(model, ndims).erase(),
            #[cfg(test)]
            Self::Mock(client) => client.embedding(model, ndims),
        }
    }

    /// OpenAI's reasoning models reject `temperature`, so it's left at the model's default.
    pub fn supports_temperature(&self) -> bool {
        #[cfg(not(test))]
        return !matches!(self, Self::OpenAI(_));
        #[cfg(test)]
        true
    }
}
