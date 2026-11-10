use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::services::element_creation_service::ElementCreationError;
use crate::elements::value_objects::element_id::ElementId;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionError;
use crate::import::anki::extraction::AnkiExtractionError;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::services::imported_html_converter::ImportedHtmlConverterError;

/// Told how many cards are converted so far; answering `false` stops the import before it writes anything.
pub type AnkiImportProgress = Arc<dyn Fn(usize) -> bool + Send + Sync>;

/// Recreates Anki decks as nested folders of cards and image occlusions.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait AnkiImportService: Send + Sync {
    /// Imports an `.apkg`/`.colpkg` package: a folder per deck and subdeck holding its cards and
    /// image occlusions. Returns the first top-level folder.
    async fn import_package(
        &self,
        bytes: Vec<u8>,
        parent: Option<ElementId>,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<Option<ElementId>, AnkiImportError>;

    /// Imports only the `wanted` Anki cards of a package, the way `import_package` does, into the
    /// `folders` already holding their decks (by path), and returns how many it imported.
    async fn import_cards(
        &self,
        bytes: Vec<u8>,
        wanted: HashSet<AnkiCardId>,
        folders: HashMap<Vec<String>, ElementId>,
        bibliographical_source_id: Option<Uuid>,
        on_progress: AnkiImportProgress,
    ) -> Result<usize, AnkiImportError>;
}

#[derive(Debug, Error)]
pub enum AnkiImportError {
    #[error("The import was cancelled")]
    Cancelled,

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
