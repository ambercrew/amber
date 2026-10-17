use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::embeddings::{Embedding, EmbeddingsBuilder};
use rig::loaders::{FileLoader, PdfFileLoader};
use text_splitter::{ChunkConfig, TextSplitter};
use uuid::Uuid;

use crate::ai_integration::ai_state::AiState;
use crate::ai_integration::clients::multi_client::multi_embedding_model::MultiEmbeddingModel;
use crate::ai_integration::entities::document::Document;
use crate::ai_integration::entities::message::{self, Message, MessageContent};
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::ai_client_provider::{
    AiClientProvider, AiClientProviderError,
};
use crate::ai_integration::services::document_uploader::{
    DocumentUploader, DocumentUploaderError, UploadOutcome,
};

#[derive(ScopeInjectable)]
pub struct DefaultDocumentUploader {
    ai_repository: Arc<dyn AiRepository>,
    ai_client_provider: Arc<dyn AiClientProvider>,
    state: Arc<AiState>,
}

impl DefaultDocumentUploader {
    /// Reads, chunks and embeds the file: the slow part, which stopping can interrupt.
    async fn embed_document(
        &self,
        path: &Path,
        chat_id: Uuid,
    ) -> Result<(MultiEmbeddingModel, Vec<(Document, Vec<Embedding>)>), DocumentUploaderError> {
        let client = self.ai_client_provider.get_client().await?;
        let embed_model = self
            .ai_client_provider
            .get_embeddings_model(&client)
            .await?;

        // PDF parsing is blocking, so it runs off the async runtime to stay cancellable.
        let file_path = path.to_path_buf();
        let documents = tokio::task::spawn_blocking(move || load_documents(&file_path, chat_id))
            .await
            .map_err(|err| err.to_string())??;

        let embeddings = EmbeddingsBuilder::new(embed_model.clone())
            .documents(documents)?
            .build()
            .await?;

        Ok((embed_model, embeddings))
    }
}

#[async_trait]
impl DocumentUploader for DefaultDocumentUploader {
    async fn upload_document(
        &self,
        path: PathBuf,
        chat_id: Uuid,
    ) -> Result<UploadOutcome, DocumentUploaderError> {
        let _guard = self.state.start_generation().await;

        let result = tokio::select! {
            result = self.embed_document(&path, chat_id) => result,
            () = self.state.cancelled() => return Ok(UploadOutcome::Stopped),
        };
        let (embed_model, embeddings) = match result {
            Ok(embedded) => embedded,
            Err(DocumentUploaderError::AiClientProvider(AiClientProviderError::Cancelled)) => {
                return Ok(UploadOutcome::Stopped);
            }
            Err(err) => return Err(err),
        };
        // `select!` may pick the finished embedding over a stop that arrived alongside it.
        if self.state.generation_cancelled() {
            return Ok(UploadOutcome::Stopped);
        }

        let vector_store = self
            .ai_client_provider
            .get_vector_store(&embed_model)
            .await?;
        vector_store.add_rows(embeddings).await?;

        self.ai_repository
            .upsert_message(&Message::new(
                None,
                chat_id,
                MessageContent::Document(message::DocumentContent {
                    file_name: path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("")
                        .to_string(),
                }),
            ))
            .await?;

        Ok(UploadOutcome::Uploaded)
    }
}

/// Splits the file into chunks to embed: per page for PDFs, per file otherwise.
fn load_documents(path: &Path, chat_id: Uuid) -> Result<Vec<Document>, DocumentUploaderError> {
    let splitter = TextSplitter::new(ChunkConfig::new(512).with_trim(false));
    let glob = &path.to_string_lossy();

    if let Some(extension) = path.extension()
        && extension == "pdf"
    {
        let loader = PdfFileLoader::with_glob(glob)?;

        return Ok(loader
            .load_with_path()
            .ignore_errors()
            .by_page()
            .into_iter()
            .flat_map(|(_path, result)| result)
            .map(|(_pageno, result)| result)
            .filter_map(|v| v.ok())
            .enumerate()
            .flat_map(|(page_i, page)| {
                splitter
                    .chunks(&page)
                    .enumerate()
                    .map(move |(chunk_i, chunk)| Document {
                        id: format!("page_{page_i}_chunk_{chunk_i}"),
                        content: chunk.to_string(),
                        chat_id,
                    })
                    .collect::<Vec<_>>()
            })
            .collect());
    }

    let loader = FileLoader::with_glob(glob)?;

    Ok(loader
        .read()
        .ignore_errors()
        .into_iter()
        .enumerate()
        .flat_map(|(file_i, content)| {
            splitter
                .chunks(&content)
                .enumerate()
                .map(move |(chunk_i, chunk)| Document {
                    id: format!("content_{file_i}_chunk_{chunk_i}"),
                    content: chunk.to_string(),
                    chat_id,
                })
                .collect::<Vec<_>>()
        })
        .collect())
}

#[cfg(test)]
pub mod tests {
    use std::{iter, sync::Arc};

    use injector::{injector::Injector, register_scope};
    use rig::{embeddings::Embedding, tool::Tool};
    use tokio::sync::Mutex;
    use uuid::Uuid;

    use crate::{
        ai_integration::{
            ai_state::AiState,
            clients::mock_client::{DEFAULT_MOCK_EMBEDDINGS_DIMS, MockClient},
            entities::{chat::Chat, message::MessageContent},
            repositories::ai_repository::AiRepository,
            services::{
                document_uploader::DocumentUploader,
                implementations::default_ai_client_provider::DefaultAiClientProvider,
            },
            tools::search_documents::{SearchDocuments, SearchDocumentsArgs},
        },
        infrastructure::repositories::{
            disk::disk_settings_repository::DiskSettingsRepository,
            sqlite::sqlite_ai_repository::SqliteAiRepository,
        },
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
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);
        register_scope!(injector, dyn DocumentUploader, DefaultDocumentUploader);

        injector
    }

    #[tokio::test]
    pub async fn upload_document_pdf_file_uploaded_file_and_added_message() {
        // Arrange

        let mock_client = MockClient {
            embeddings_model_dims: Some(DEFAULT_MOCK_EMBEDDINGS_DIMS),
            embed_texts_fn: Arc::new(Some(Box::new(move |request| {
                if request.len() == 1 && request[0].trim() == "Page 1 content" {
                    let embeddings = Embedding {
                        document: String::new(),
                        vec: iter::once(12f64)
                            .chain(iter::repeat_n(0f64, DEFAULT_MOCK_EMBEDDINGS_DIMS - 1))
                            .collect(),
                    };

                    return Ok(vec![embeddings]);
                } else if request.len() == 1 && request[0] == "search query" {
                    let embeddings = Embedding {
                        document: String::new(),
                        vec: iter::once(11.9f64)
                            .chain(iter::repeat_n(0f64, DEFAULT_MOCK_EMBEDDINGS_DIMS - 1))
                            .collect(),
                    };

                    return Ok(vec![embeddings]);
                }
                unreachable!()
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, Arc::new(AiState::default())).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn DocumentUploader>().await;

        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let chat_id = Uuid::new_v4();
        ai_repository
            .upsert_chat(&Chat::new(Some(chat_id), "test".to_string()))
            .await
            .unwrap();

        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/example.pdf");

        // Act

        let actual = service.upload_document(path, chat_id).await.unwrap();

        // Assert

        assert_eq!(UploadOutcome::Uploaded, actual);
        let messages = ai_repository
            .get_chat_messages_ordered(chat_id)
            .await
            .unwrap();
        assert_eq!(1, messages.len());
        if let MessageContent::Document(document) = messages[0].content() {
            assert_eq!(document.file_name, "example.pdf");
        } else {
            panic!("Expected document");
        }

        let ai_client_provider = scope.resolve::<dyn AiClientProvider>().await;
        let search_tool = SearchDocuments::new(ai_client_provider, chat_id);
        let search_result = Tool::call(
            &search_tool,
            &mut rig::tool::ToolContext::default(),
            SearchDocumentsArgs {
                query: "search query".to_string(),
                top_k: 1,
            },
        )
        .await
        .unwrap();

        assert_eq!(1, search_result.len());
        assert_eq!("Page 1 content", search_result[0].content.trim());
    }

    #[tokio::test]
    pub async fn upload_document_stopped_while_embedding_did_not_add_message() {
        // Arrange

        let state = Arc::new(AiState::default());
        let embedding_state = state.clone();
        let mock_client = MockClient {
            embeddings_model_dims: Some(DEFAULT_MOCK_EMBEDDINGS_DIMS),
            embed_texts_fn: Arc::new(Some(Box::new(move |request| {
                embedding_state.cancel_generation();
                Ok(request
                    .iter()
                    .map(|_| Embedding {
                        document: String::new(),
                        vec: vec![0f64; DEFAULT_MOCK_EMBEDDINGS_DIMS],
                    })
                    .collect())
            }))),
            ..Default::default()
        };

        let injector = initialize_test_injector(mock_client, state).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn DocumentUploader>().await;

        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let chat_id = Uuid::new_v4();
        ai_repository
            .upsert_chat(&Chat::new(Some(chat_id), "test".to_string()))
            .await
            .unwrap();

        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/example.pdf");

        // Act

        let actual = service.upload_document(path, chat_id).await.unwrap();

        // Assert

        assert_eq!(UploadOutcome::Stopped, actual);
        let messages = ai_repository
            .get_chat_messages_ordered(chat_id)
            .await
            .unwrap();
        assert!(messages.is_empty());
    }
}
