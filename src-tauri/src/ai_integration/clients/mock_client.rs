use std::sync::Arc;

use async_stream::stream;
use rig::{
    completion::{CompletionError, CompletionModel, CompletionRequest, CompletionResponse, Usage},
    embeddings::EmbeddingModel,
    streaming::{RawStreamingChoice, StreamFinal, StreamingCompletionResponse},
};

type CompletionFn = dyn Send + Sync + Fn(CompletionRequest) -> CompletionResponse;

type StreamFn =
    dyn Send + Sync + Fn(CompletionRequest) -> Result<Option<RawStreamingChoice>, CompletionError>;

type EmbedTextsFn = dyn Send
    + Sync
    + Fn(Vec<String>) -> Result<Vec<rig::embeddings::Embedding>, rig::embeddings::EmbeddingError>;

#[derive(Default, Clone)]
pub struct MockClient {
    pub model: Option<String>,
    pub completion_fn: Arc<Option<Box<CompletionFn>>>,
    pub stream_fn: Arc<Option<Box<StreamFn>>>,

    pub embeddings_model: Option<String>,
    pub embeddings_model_dims: Option<usize>,
    pub embed_texts_fn: Arc<Option<Box<EmbedTextsFn>>>,
}

pub const DEFAULT_MOCK_EMBEDDINGS_DIMS: usize = 2560;

/// Stable provider descriptor reported by streams this mock opens.
pub const MOCK_PROVIDER: &str = "mock";

impl CompletionModel for MockClient {
    async fn completion(
        &self,
        request: rig::completion::CompletionRequest,
    ) -> Result<CompletionResponse, CompletionError> {
        match &*self.completion_fn {
            Some(completion_fn) => Ok(completion_fn(request)),
            None => panic!("No completion function provided!"),
        }
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse, CompletionError> {
        if self.stream_fn.is_none() {
            panic!("No streaming function provided!");
        }

        let stream_fn = Arc::clone(&self.stream_fn);

        let stream = stream! {
            loop {
                let response = stream_fn.as_ref().as_ref().unwrap()(request.clone());
                if let Ok(Some(response)) = response {
                    yield Ok(response);
                } else if let Err(err) = response {
                    yield Err(err);
                    break;
                } else {
                    yield Ok(RawStreamingChoice::FinalResponse(StreamFinal::new(
                        MOCK_PROVIDER,
                        Usage::default(),
                    )));
                    break;
                }
            }
        };

        Ok(StreamingCompletionResponse::stream(
            MOCK_PROVIDER,
            Box::pin(stream),
        ))
    }
}

impl EmbeddingModel for MockClient {
    const MAX_DOCUMENTS: usize = 1024;

    type Client = MockClient;

    fn make(client: &Self::Client, model: impl Into<String>, dims: Option<usize>) -> Self {
        let mut new_client = client.clone();
        new_client.embeddings_model = Some(model.into());
        new_client.embeddings_model_dims = dims;
        new_client
    }

    fn ndims(&self) -> usize {
        self.embeddings_model_dims
            .unwrap_or(DEFAULT_MOCK_EMBEDDINGS_DIMS)
    }

    async fn embed_texts(
        &self,
        texts: impl IntoIterator<Item = String> + rig::wasm_compat::WasmCompatSend,
    ) -> Result<Vec<rig::embeddings::Embedding>, rig::embeddings::EmbeddingError> {
        let texts = texts.into_iter().collect::<Vec<_>>();
        match &*self.embed_texts_fn {
            Some(embed_texts_fn) => embed_texts_fn(texts),
            None => panic!("No embed texts function provided!"),
        }
    }
}
