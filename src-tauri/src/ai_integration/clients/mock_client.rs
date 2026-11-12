use std::sync::Arc;

use async_stream::stream;

use rig::{
    DynModel, Model, ProviderError,
    completion::{AssistantContent, CompletionRequest, CompletionResponse, Usage},
    driver::{Exchange, Local, Opened, Opening, Step, Transport},
    embeddings::{Embedding, EmbeddingResponse},
    message::Origin,
    operation::{Completion, Embedding as EmbeddingOp},
    test_utils::{MOCK_API, MOCK_PROVIDER, MockFrame, MockScript, MockStreamEvent},
    wire::{Capabilities, Mode},
};

type CompletionFn = dyn Send + Sync + Fn(CompletionRequest) -> Vec<AssistantContent>;

/// Called once per streamed event until it returns `None`, which ends the reply.
type StreamFn = dyn Send + Sync + Fn(CompletionRequest) -> Option<MockStreamEvent>;

type EmbedTextsFn = dyn Send + Sync + Fn(Vec<String>) -> Result<Vec<Embedding>, String>;

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

impl MockClient {
    pub fn completion(&self, model: impl Into<String>) -> DynModel<Completion> {
        let mut client = self.clone();
        client.model = Some(model.into());
        Model::new(MockScript::new(MOCK_PROVIDER), client).erase()
    }

    pub fn embedding(
        &self,
        model: impl Into<String>,
        ndims: Option<usize>,
    ) -> DynModel<EmbeddingOp> {
        let mut client = self.clone();
        client.embeddings_model = Some(model.into());
        client.embeddings_model_dims = ndims.or(client.embeddings_model_dims);
        let ndims = client.ndims();
        Model::new(
            Local::new(MOCK_PROVIDER).with_capabilities(Capabilities::embedding(1024, ndims)),
            client,
        )
        .erase()
    }

    fn ndims(&self) -> usize {
        self.embeddings_model_dims
            .unwrap_or(DEFAULT_MOCK_EMBEDDINGS_DIMS)
    }
}

impl Transport<MockScript> for MockClient {
    fn send(&self, request: CompletionRequest, exchange: Exchange) -> Opening<MockFrame> {
        match exchange.mode {
            Mode::Unary => {
                let Some(completion_fn) = &*self.completion_fn else {
                    panic!("No completion function provided!");
                };
                let origin = Origin::new(MOCK_API, MOCK_PROVIDER, "");
                let response = CompletionResponse::new(
                    completion_fn(request),
                    Usage::default(),
                    origin,
                    serde_json::Value::Null,
                );
                Opening::ready(Opened::new(tokio_stream::iter([Ok(MockFrame::Response(
                    Box::new(response),
                ))])))
            }
            Mode::Streaming => {
                assert!(self.stream_fn.is_some(), "No streaming function provided!");
                let stream_fn = Arc::clone(&self.stream_fn);
                // Asked lazily, one event at a time, so a test can react to what was already streamed.
                let frames = stream! {
                    loop {
                        // Arrives like a network stream, not all at once.
                        tokio::task::yield_now().await;
                        match (*stream_fn).as_ref().unwrap()(request.clone()) {
                            Some(MockStreamEvent::Error(error)) => {
                                yield Ok(MockFrame::Event(MockStreamEvent::Error(error)));
                                break;
                            }
                            Some(event) => yield Ok(MockFrame::Event(event)),
                            None => {
                                yield Ok(MockFrame::Event(
                                    MockStreamEvent::final_response_with_default_usage(),
                                ));
                                break;
                            }
                        }
                    }
                };
                Opening::ready(Opened::new(frames))
            }
        }
    }
}

impl Transport<Local<EmbeddingOp>> for MockClient {
    fn send(&self, texts: Vec<String>, _exchange: Exchange) -> Opening<Step<EmbeddingOp>> {
        let Some(embed_texts_fn) = &*self.embed_texts_fn else {
            panic!("No embed texts function provided!");
        };
        let step = embed_texts_fn(texts)
            .map_err(ProviderError::Provider)
            .map(|embeddings| {
                Step::End(EmbeddingResponse {
                    provider: MOCK_PROVIDER.to_owned(),
                    ..EmbeddingResponse::new(embeddings)
                })
            });
        Opening::ready(Opened::new(tokio_stream::iter([step])))
    }
}
