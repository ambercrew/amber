use std::path::PathBuf;

use async_trait::async_trait;
use rig::{
    embeddings::{EmbedError, EmbeddingError},
    loaders::file::FileLoaderError,
    loaders::pdf::PdfLoaderError,
    vector_store::VectorStoreError,
};
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    SourceError, ai_integration::services::ai_client_provider::AiClientProviderError,
    common::repository_error::RepositoryError,
};

#[derive(Error, Debug)]
pub enum DocumentUploaderError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("An unknown error occurred")]
    Unknown(#[source] SourceError),
    #[error("Failed to load the file")]
    FileLoader(#[from] FileLoaderError),
    #[error("Failed to load the PDF file")]
    PdfLoader(#[from] PdfLoaderError),
    #[error("Failed to embed content")]
    Embed(#[from] EmbedError),
    #[error("Failed to generate embeddings")]
    Embedding(#[from] EmbeddingError),
    #[error(transparent)]
    VectorStore(#[from] VectorStoreError),
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
}

impl From<String> for DocumentUploaderError {
    fn from(value: String) -> Self {
        #[derive(Debug)]
        struct StringError(String);
        impl std::fmt::Display for StringError {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }
        impl std::error::Error for StringError {}
        DocumentUploaderError::Unknown(Box::new(StringError(value)))
    }
}

/// Whether the document was stored, or the upload was stopped before anything was.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UploadOutcome {
    Uploaded,
    Stopped,
}

#[async_trait]
pub trait DocumentUploader: Send + Sync {
    async fn upload_document(
        &self,
        path: PathBuf,
        chat_id: Uuid,
    ) -> Result<UploadOutcome, DocumentUploaderError>;
}
