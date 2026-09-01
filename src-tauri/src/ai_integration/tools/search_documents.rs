use std::sync::Arc;

use rig::sqlite::SqliteSearchFilter;
use rig::{
    tool::{Tool, ToolContext},
    vector_store::{
        VectorSearchRequest, VectorStoreError, VectorStoreIndex, request::SearchFilter,
    },
};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::{
    clients::multi_client::MultiClient,
    entities::document::{CHAT_ID_COLUMN_NAME, Document},
    services::ai_client_provider::{AiClientProvider, AiClientProviderError},
};

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
pub struct SearchDocumentsArgs {
    #[schemars(
        description = "The search query or question to find relevant information in the uploaded files."
    )]
    pub query: String,
    #[schemars(description = "The maximum number of top matching results to return.")]
    pub top_k: u64,
}

#[derive(Error, Debug)]
pub enum SearchDocumentsError {
    #[error("Failed to fetch documents from the vector store")]
    Fetching(#[from] VectorStoreError),
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
}

pub struct SearchDocuments {
    chat_id: Uuid,
    client: MultiClient,
    ai_client_provider: Arc<dyn AiClientProvider>,
}

impl SearchDocuments {
    pub fn new(
        ai_client_provider: Arc<dyn AiClientProvider>,
        client: MultiClient,
        chat_id: Uuid,
    ) -> Self {
        Self {
            ai_client_provider,
            client,
            chat_id,
        }
    }
}

impl Tool for SearchDocuments {
    const NAME: &'static str = "search_documents";

    type Error = SearchDocumentsError;
    type Args = SearchDocumentsArgs;
    type Output = Vec<Document>;

    fn description(&self) -> String {
        "Performs semantic search over the text content of \
            all files uploaded by the user. It returns relevant \
            snippets (chunks) that match the query"
            .to_string()
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::to_value(schema_for!(SearchDocumentsArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let embed_model = self
            .ai_client_provider
            .get_embeddings_model(&self.client)
            .await?;
        let vector_store = self
            .ai_client_provider
            .get_vector_store(&embed_model)
            .await?;
        let index = vector_store.index(embed_model);

        let filter = SqliteSearchFilter::eq(
            CHAT_ID_COLUMN_NAME,
            serde_json::to_value(self.chat_id.to_string()).unwrap(),
        );

        let req = VectorSearchRequest::builder()
            .samples(args.top_k)
            .query(args.query)
            .filter(filter)
            .build();

        let results = index
            .top_n::<Document>(req)
            .await?
            .into_iter()
            .map(|(_, _, document)| document)
            .collect::<Vec<_>>();

        Ok(results)
    }
}

#[cfg(test)]
pub mod tests {
    use std::iter;

    use injector::{injector::Injector, register_scope};
    use rig::embeddings::Embedding;
    use tokio::sync::Mutex;

    use crate::{
        ai_integration::{
            ai_state::AiState,
            clients::mock_client::{DEFAULT_MOCK_EMBEDDINGS_DIMS, MockClient},
            services::implementations::default_ai_client_provider::DefaultAiClientProvider,
        },
        infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository,
        settings::{
            entities::settings::Settings, repositories::settings_repository::SettingsRepository,
            value_objects::settings_profile::SettingsProfile,
        },
        test_utils::{create_temp_directory, create_test_injector},
    };

    use super::*;

    async fn initialize_test_injector(mock_client: MockClient) -> Injector {
        let mut injector = create_test_injector().await;

        let mut settings = Settings::new(create_temp_directory().await, SettingsProfile::Default);
        settings.enable_ai = true;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton(Arc::new(mock_client));
        injector.register_singleton(Arc::new(AiState::default()));

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);

        injector
    }

    fn create_embedding(chat_id: Uuid, label: &str, x: f64, y: f64) -> (Document, Vec<Embedding>) {
        (
            Document {
                chat_id,
                id: Uuid::new_v4().to_string(),
                content: label.to_string(),
            },
            vec![Embedding {
                document: String::new(),
                vec: [x, y]
                    .into_iter()
                    .chain(iter::repeat_n(0f64, DEFAULT_MOCK_EMBEDDINGS_DIMS - 2))
                    .collect(),
            }],
        )
    }

    #[tokio::test]
    pub async fn call_multiple_documents_returned_closest_documents() {
        // Arrange

        // Query points in the same direction as "same-direction" and forms a
        // narrower angle with "close-direction" than with "opposite-direction",
        // so cosine similarity (the vector store's distance metric) ranks them
        // unambiguously: same-direction, then close-direction, excluding
        // opposite-direction from the requested top 2.
        let chat_id = Uuid::new_v4();
        let mock_client = MockClient {
            embeddings_model: Some("mock-model".to_string()),
            embeddings_model_dims: Some(DEFAULT_MOCK_EMBEDDINGS_DIMS),
            embed_texts_fn: Arc::new(Some(Box::new(move |request| {
                if request.len() == 1 && request[0] == "request" {
                    return Ok(vec![
                        create_embedding(chat_id, "query", 1f64, 1f64).1.remove(0),
                    ]);
                }
                unreachable!()
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client).await;
        let scope = injector.start_scope();
        let ai_client_provider = scope.resolve::<dyn AiClientProvider>().await;

        let client = ai_client_provider.get_client().await.unwrap();
        let embed_model = ai_client_provider
            .get_embeddings_model(&client)
            .await
            .unwrap();
        let vector_store = ai_client_provider
            .get_vector_store(&embed_model)
            .await
            .unwrap();

        let embeddings: Vec<(Document, Vec<Embedding>)> = vec![
            create_embedding(chat_id, "close-direction", 1f64, 0f64),
            create_embedding(chat_id, "same-direction", 2f64, 2f64),
            create_embedding(chat_id, "opposite-direction", -1f64, -1f64),
        ];
        vector_store.add_rows(embeddings).await.unwrap();

        let tool = SearchDocuments::new(ai_client_provider, client, chat_id);

        // Act

        let actual = tool
            .call(
                &mut ToolContext::default(),
                SearchDocumentsArgs {
                    query: "request".to_string(),
                    top_k: 2,
                },
            )
            .await
            .unwrap();

        // Assert

        assert_eq!(2, actual.len());
        assert_eq!("same-direction", actual[0].content);
        assert_eq!("close-direction", actual[1].content);
    }
}
