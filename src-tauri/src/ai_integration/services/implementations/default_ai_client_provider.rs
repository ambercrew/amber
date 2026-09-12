use std::sync::{Arc, Once};

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::client::EmbeddingsClient;
#[cfg(not(test))]
use rig::client::{BearerAuth, Nothing, ProviderClient};
use rig::embeddings::EmbeddingModel;
#[cfg(not(test))]
use rig::providers::{ollama, openai, openrouter};
use rig::sqlite::SqliteVectorStore;
use tokio::fs;
use tokio_rusqlite::Connection;

use crate::ai_integration::ai_state::AiState;
#[cfg(test)]
use crate::ai_integration::clients::mock_client::MockClient;
use crate::ai_integration::clients::multi_client::MultiClient;
use crate::ai_integration::clients::multi_client::multi_embedding_model::MultiEmbeddingModel;
use crate::ai_integration::entities::document::Document;
use crate::ai_integration::services::ai_client_provider::{
    AiClientProvider, AiClientProviderError,
};
use crate::infrastructure::value_objects::app_data_directory::AppDataDirectory;
use crate::secrets::repositories::secrets_repository::SecretsRepository;
use crate::settings::repositories::settings_repository::SettingsRepository;
#[cfg(not(test))]
use crate::settings::value_objects::ai_provider::AiProvider;

#[cfg(not(debug_assertions))]
const VECTOR_STORE_NAME: &str = "vector_store.db";
#[cfg(debug_assertions)]
const VECTOR_STORE_NAME: &str = "vector_store.dev.db";

static REGISTER_SQLITE_VEC: Once = Once::new();

/// Registers the `vec0` SQLite extension process-wide so any rusqlite
/// connection opened afterwards (including the one used for the vector
/// store below) can create/query `vec0` virtual tables. Without this,
/// every call fails with "no such module: vec0", even
/// for chats that never had a document uploaded, since the vector store
/// (and its `vec0` table) is created eagerly for every chat's search tool.
fn register_sqlite_vec_extension() {
    REGISTER_SQLITE_VEC.call_once(|| unsafe {
        #[allow(clippy::missing_transmute_annotations)]
        tokio_rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

#[derive(ScopeInjectable)]
pub struct DefaultAiClientProvider {
    settings_repository: Arc<dyn SettingsRepository>,
    #[cfg_attr(test, allow(dead_code))]
    secrets_repository: Arc<dyn SecretsRepository>,
    app_data_directory: Arc<AppDataDirectory>,
    state: Arc<AiState>,
    #[cfg(test)]
    mock_client: Arc<MockClient>,
}

pub const OPENAI_API_KEY_SECRET: &str = "openai_api_key";
pub const OPENROUTER_API_KEY_SECRET: &str = "openrouter_api_key";

#[async_trait]
impl AiClientProvider for DefaultAiClientProvider {
    async fn get_client(&self) -> Result<MultiClient, AiClientProviderError> {
        let settings = self.settings_repository.get_settings().await;
        if !settings.enable_ai {
            return Err(AiClientProviderError::AiNotEnabled);
        }

        #[cfg(test)]
        return Ok(MultiClient::Mock((*self.mock_client).clone()));

        #[cfg(not(test))]
        {
            match settings.ai_provider {
                AiProvider::Ollama => match ollama::Client::from_val(Nothing.into()) {
                    Ok(client) => Ok(MultiClient::Ollama(client)),
                    Err(err) => {
                        log::error!("Error creating the Ollama client: {:?}", err);
                        Err(AiClientProviderError::CreateClient)
                    }
                },
                AiProvider::OpenAI => {
                    let api_key = self
                        .secrets_repository
                        .get_secret(OPENAI_API_KEY_SECRET)
                        .await
                        .ok_or(AiClientProviderError::OpenAIApiKeyNotSet)?;
                    match openai::CompletionsClient::from_val(BearerAuth::from(api_key)) {
                        Ok(client) => Ok(MultiClient::OpenAI(client)),
                        Err(err) => {
                            log::error!("Error creating the OpenAI client: {:?}", err);
                            Err(AiClientProviderError::CreateClient)
                        }
                    }
                }
                AiProvider::OpenRouter => {
                    let api_key = self
                        .secrets_repository
                        .get_secret(OPENROUTER_API_KEY_SECRET)
                        .await
                        .ok_or(AiClientProviderError::OpenRouterApiKeyNotSet)?;
                    match openrouter::Client::from_val(BearerAuth::from(api_key)) {
                        Ok(client) => Ok(MultiClient::OpenRouter(client)),
                        Err(err) => {
                            log::error!("Error creating the OpenRouter client: {:?}", err);
                            Err(AiClientProviderError::CreateClient)
                        }
                    }
                }
            }
        }
    }

    async fn get_completion_model_name(&self) -> Result<String, AiClientProviderError> {
        #[cfg(test)]
        return Ok(self.mock_client.model.clone().unwrap_or_default());

        #[cfg(not(test))]
        {
            let settings = self.settings_repository.get_settings().await;

            match settings.ai_provider {
                AiProvider::Ollama => {
                    if settings.ollama.model_name.is_none() {
                        return Err(AiClientProviderError::OllamaModelNameIsNotFilled);
                    }
                    let model_name = settings
                        .ollama
                        .model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(AiClientProviderError::OllamaModelNameIsNotFilled);
                    }
                    log::info!("Using the Ollama model with name '{model_name}'.");
                    Ok(model_name)
                }
                AiProvider::OpenAI => {
                    if settings.openai.model_name.is_none() {
                        return Err(AiClientProviderError::OpenAIModelNameIsNotFilled);
                    }
                    let model_name = settings
                        .openai
                        .model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(AiClientProviderError::OpenAIModelNameIsNotFilled);
                    }
                    log::info!("Using the OpenAI model with name '{model_name}'.");
                    Ok(model_name)
                }
                AiProvider::OpenRouter => {
                    if settings.openrouter.model_name.is_none() {
                        return Err(AiClientProviderError::OpenRouterModelNameIsNotFilled);
                    }
                    let model_name = settings
                        .openrouter
                        .model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(AiClientProviderError::OpenRouterModelNameIsNotFilled);
                    }
                    log::info!("Using the OpenRouter model with name '{model_name}'.");
                    Ok(model_name)
                }
            }
        }
    }

    async fn get_embeddings_model_name(&self) -> Result<String, AiClientProviderError> {
        #[cfg(test)]
        return Ok(self
            .mock_client
            .embeddings_model
            .clone()
            .unwrap_or_default());

        #[cfg(not(test))]
        {
            let settings = self.settings_repository.get_settings().await;

            match settings.ai_provider {
                AiProvider::Ollama => {
                    if settings.ollama.embeddings_model_name.is_none() {
                        return Err(AiClientProviderError::OllamaEmbeddingsModelNameIsNotFilled);
                    }
                    let model_name = settings
                        .ollama
                        .embeddings_model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(AiClientProviderError::OllamaEmbeddingsModelNameIsNotFilled);
                    }
                    log::info!("Using the Ollama embeddings model with name '{model_name}'.");
                    Ok(model_name)
                }
                AiProvider::OpenAI => {
                    if settings.openai.embeddings_model_name.is_none() {
                        return Err(AiClientProviderError::OpenAIEmbeddingsModelNameIsNotFilled);
                    }
                    let model_name = settings
                        .openai
                        .embeddings_model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(AiClientProviderError::OpenAIEmbeddingsModelNameIsNotFilled);
                    }
                    log::info!("Using the OpenAI embeddings model with name '{model_name}'.");
                    Ok(model_name)
                }
                AiProvider::OpenRouter => {
                    if settings.openrouter.embeddings_model_name.is_none() {
                        return Err(
                            AiClientProviderError::OpenRouterEmbeddingsModelNameIsNotFilled,
                        );
                    }
                    let model_name = settings
                        .openrouter
                        .embeddings_model_name
                        .as_ref()
                        .unwrap()
                        .clone()
                        .trim()
                        .to_string();
                    if model_name.is_empty() {
                        return Err(
                            AiClientProviderError::OpenRouterEmbeddingsModelNameIsNotFilled,
                        );
                    }
                    log::info!("Using the OpenRouter embeddings model with name '{model_name}'.");
                    Ok(model_name)
                }
            }
        }
    }

    async fn get_embeddings_model(
        &self,
        client: &MultiClient,
    ) -> Result<MultiEmbeddingModel, AiClientProviderError> {
        let model_name = self.get_embeddings_model_name().await?;
        let probe_model = client.embedding_model(&model_name);

        if probe_model.ndims() > 0 {
            return Ok(probe_model);
        }

        // The probe call has no hook mechanism to check cancellation mid-flight
        // (unlike the agent/extractor completion calls), so it's only checked
        // around the call itself.
        if self.state.generation_cancelled() {
            return Err(AiClientProviderError::Cancelled);
        }

        // Not every provider (e.g. Ollama) reports every model's dimensions, so for
        // models it doesn't recognize the real output size is detected with a
        // throwaway embedding call. This keeps it consistent with the vector store
        // table dimensions, which are created from this same model.
        let actual_dims = probe_model
            .embed_texts(vec!["ping".to_string()])
            .await?
            .first()
            .map(|embedding| embedding.vec.len())
            .unwrap_or(0);

        if self.state.generation_cancelled() {
            return Err(AiClientProviderError::Cancelled);
        }

        Ok(client.embedding_model_with_ndims(model_name, actual_dims))
    }

    async fn get_vector_store(
        &self,
        embed_model: &MultiEmbeddingModel,
    ) -> Result<SqliteVectorStore<MultiEmbeddingModel, Document>, AiClientProviderError> {
        register_sqlite_vec_extension();

        let vector_store_directory = self
            .app_data_directory
            .get_path()
            .join("ai")
            .join("embeddings_vector_stores");

        if let Err(err) = fs::create_dir_all(&vector_store_directory).await {
            return Err(AiClientProviderError::CreateVectorStoreDirectory(Box::new(
                err,
            )));
        }

        let path =
            vector_store_directory.join(format!("{VECTOR_STORE_NAME}_{}", embed_model.ndims()));
        let path = &*path.to_string_lossy();
        let conn = match Connection::open(path).await {
            Err(err) => {
                return Err(AiClientProviderError::ConnectingToEmbeddingsDatabase(
                    Box::new(err),
                ));
            }
            Ok(conn) => conn,
        };
        Ok(SqliteVectorStore::new(conn, embed_model).await?)
    }
}

#[cfg(test)]
pub mod tests {
    use std::sync::Arc;

    use injector::{injector::Injector, register_scope};
    use rig::embeddings::Embedding;
    use tokio::sync::Mutex;

    use crate::{
        ai_integration::services::ai_client_provider::AiClientProvider,
        infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository,
        settings::{
            entities::settings::Settings, repositories::settings_repository::SettingsRepository,
            value_objects::settings_profile::SettingsProfile,
        },
        test_utils::{create_temp_directory, create_test_injector},
    };

    use super::*;

    async fn initialize_test_injector(mock_client: MockClient, state: Arc<AiState>) -> Injector {
        let mut injector = create_test_injector().await;

        let mut settings = Settings::new(create_temp_directory().await, SettingsProfile::Default);
        settings.enable_ai = true;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton(Arc::new(mock_client));
        injector.register_singleton(state);

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);

        injector
    }

    #[tokio::test]
    pub async fn get_embeddings_model_known_dimensions_did_not_probe() {
        // Arrange

        let mock_client = MockClient {
            embeddings_model: Some("known-model".to_string()),
            embeddings_model_dims: Some(1536),
            // No embed_texts_fn: a probe call here would panic.
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiClientProvider>().await;
        let client = service.get_client().await.unwrap();

        // Act

        let embed_model = service.get_embeddings_model(&client).await.unwrap();

        // Assert

        assert_eq!(1536, embed_model.ndims());
    }

    #[tokio::test]
    pub async fn get_embeddings_model_unknown_dimensions_detected_actual_dimensions_via_probe() {
        // Arrange

        let mock_client = MockClient {
            embeddings_model: Some("unknown-model".to_string()),
            embeddings_model_dims: Some(0),
            embed_texts_fn: Arc::new(Some(Box::new(|texts| {
                Ok(texts
                    .into_iter()
                    .map(|text| Embedding {
                        document: text,
                        vec: vec![0f64; 1024],
                    })
                    .collect())
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiClientProvider>().await;
        let client = service.get_client().await.unwrap();

        // Act

        let embed_model = service.get_embeddings_model(&client).await.unwrap();

        // Assert

        assert_eq!(1024, embed_model.ndims());
    }

    #[tokio::test]
    pub async fn get_embeddings_model_cancelled_before_probe_returned_cancelled_error() {
        // Arrange

        let mock_client = MockClient {
            embeddings_model: Some("unknown-model".to_string()),
            embeddings_model_dims: Some(0),
            // No embed_texts_fn: a probe call here would panic.
            ..Default::default()
        };

        let state = Arc::new(AiState::default());
        state.cancel_generation();

        let injector = initialize_test_injector(mock_client, state).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiClientProvider>().await;
        let client = service.get_client().await.unwrap();

        // Act

        let result = service.get_embeddings_model(&client).await;

        // Assert

        assert!(matches!(result, Err(AiClientProviderError::Cancelled)));
    }
}
