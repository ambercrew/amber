use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::services::element_creation_service::ElementCreationError;
use crate::elements::value_objects::element_id::ElementId;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionError;
use crate::import::anki::extraction::AnkiExtractionError;
use crate::import::services::imported_html_converter::ImportedHtmlConverterError;

/// Recreates Anki decks as nested folders of cards and image occlusions.
#[async_trait]
pub trait AnkiImportService: Send + Sync {
    /// Imports an `.apkg`/`.colpkg` package: a folder per deck and subdeck holding its cards and
    /// image occlusions. Returns the first top-level folder.
    async fn import_package(
        &self,
        bytes: Vec<u8>,
        parent: Option<ElementId>,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<Option<ElementId>, AnkiImportError>;
}

#[derive(Debug, Error)]
pub enum AnkiImportError {
    #[error(transparent)]
    Extraction(#[from] AnkiExtractionError),

    #[error("Reading the Anki package failed")]
    ExtractionTask(#[from] tokio::task::JoinError),

    #[error(transparent)]
    Conversion(#[from] ImportedHtmlConverterError),

    #[error(transparent)]
    Creation(#[from] ElementCreationError),

    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ImageOcclusion(#[from] ImageOcclusionError),
}
