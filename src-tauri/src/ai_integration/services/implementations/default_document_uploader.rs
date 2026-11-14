use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::loaders::{FileLoader, PdfFileLoader};
use uuid::Uuid;

use crate::ai_integration::ai_state::AiState;
use crate::ai_integration::entities::document::Document;
use crate::ai_integration::entities::message::{self, Message, MessageContent};
use crate::ai_integration::repositories::ai_document_repository::AiDocumentRepository;
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::document_uploader::{
    DocumentUploader, DocumentUploaderError, UploadOutcome,
};

#[derive(ScopeInjectable)]
pub struct DefaultDocumentUploader {
    ai_repository: Arc<dyn AiRepository>,
    ai_document_repository: Arc<dyn AiDocumentRepository>,
    state: Arc<AiState>,
}

#[async_trait]
impl DocumentUploader for DefaultDocumentUploader {
    async fn upload_document(
        &self,
        path: PathBuf,
        chat_id: Uuid,
    ) -> Result<UploadOutcome, DocumentUploaderError> {
        let _guard = self.state.start_generation().await;

        // PDF parsing is blocking, so it runs off the async runtime to stay cancellable.
        let file_path = path.clone();
        let pages = tokio::select! {
            result = tokio::task::spawn_blocking(move || load_pages(&file_path)) => {
                result.map_err(|err| err.to_string())??
            }
            () = self.state.cancelled() => return Ok(UploadOutcome::Stopped),
        };
        // `select!` may pick the finished load over a stop that arrived alongside it.
        if self.state.generation_cancelled() {
            return Ok(UploadOutcome::Stopped);
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();
        let first_position = self.ai_document_repository.next_position(chat_id).await?;
        let documents: Vec<_> = pages
            .into_iter()
            .enumerate()
            .map(|(index, (page, content))| Document {
                id: Uuid::new_v4(),
                chat_id,
                file_name: file_name.clone(),
                position: first_position + index as u32,
                page,
                content,
            })
            .collect();
        self.ai_document_repository.insert(&documents).await?;

        self.ai_repository
            .upsert_message(&Message::new(
                None,
                chat_id,
                MessageContent::Document(message::DocumentContent { file_name }),
            ))
            .await?;

        Ok(UploadOutcome::Uploaded)
    }
}

/// The file's text with its 1-based page: one entry per PDF page, or the whole file otherwise.
fn load_pages(path: &Path) -> Result<Vec<(Option<u32>, String)>, DocumentUploaderError> {
    let glob = &path.to_string_lossy();

    if let Some(extension) = path.extension()
        && extension == "pdf"
    {
        return Ok(PdfFileLoader::with_glob(glob)?
            .load_with_path()
            .ignore_errors()
            .by_page()
            .into_iter()
            .flat_map(|(_path, pages)| pages)
            // The loader's page numbers count from 0 and skip no page, even one that failed.
            .filter_map(|(page_number, page)| {
                Some((Some(page_number as u32 + 1), join_lines(&page.ok()?)))
            })
            .collect());
    }

    Ok(FileLoader::with_glob(glob)?
        .read()
        .ignore_errors()
        .into_iter()
        .map(|content| (None, content))
        .collect())
}

/// A PDF page's text with each paragraph on one line: extraction ends every printed line with a
/// break, which would stop a phrase wrapping onto the next line from matching.
fn join_lines(page: &str) -> String {
    page.split("\n")
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .split(|line| line.is_empty())
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| paragraph.join(" "))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
pub mod tests {
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        ai_integration::{
            entities::{chat::Chat, message::MessageContent},
            services::document_uploader::DocumentUploader,
        },
        infrastructure::repositories::sqlite::{
            sqlite_ai_document_repository::SqliteAiDocumentRepository,
            sqlite_ai_repository::SqliteAiRepository,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        injector.register_singleton(Arc::new(AiState::default()));
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(
            injector,
            dyn AiDocumentRepository,
            SqliteAiDocumentRepository
        );
        register_scope!(injector, dyn DocumentUploader, DefaultDocumentUploader);
        injector
    }

    #[test]
    fn join_lines_wrapped_paragraphs_joined_and_blank_lines_kept_as_breaks() {
        // Arrange

        let page = "The cell\nwall  is rigid.\n \n\nIt   protects\nthe cell.\n";

        // Act

        let actual = join_lines(page);

        // Assert

        assert_eq!("The cell wall is rigid.\nIt protects the cell.", actual);
    }

    #[tokio::test]
    pub async fn upload_document_pdf_file_stored_its_pages_and_added_message() {
        // Arrange

        let injector = initialize_test_injector().await;
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

        let pages = scope
            .resolve::<dyn AiDocumentRepository>()
            .await
            .find_candidates(chat_id, "page 1 content", false)
            .await
            .unwrap();
        assert_eq!(1, pages.len());
        assert_eq!(
            (Some(1), "example.pdf"),
            (pages[0].page, pages[0].file_name.as_str())
        );
    }

    #[tokio::test]
    pub async fn upload_document_second_file_placed_after_the_first() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn DocumentUploader>().await;
        let chat_id = Uuid::new_v4();
        scope
            .resolve::<dyn AiRepository>()
            .await
            .upsert_chat(&Chat::new(Some(chat_id), "test".to_string()))
            .await
            .unwrap();
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/example.pdf");
        service
            .upload_document(path.clone(), chat_id)
            .await
            .unwrap();

        // Act

        service.upload_document(path, chat_id).await.unwrap();

        // Assert

        let positions: Vec<_> = scope
            .resolve::<dyn AiDocumentRepository>()
            .await
            .find_candidates(chat_id, "page 1 content", false)
            .await
            .unwrap()
            .iter()
            .map(|page| page.position)
            .collect();
        assert_eq!(2, positions.len());
        assert!(positions[0] < positions[1]);
    }
}
