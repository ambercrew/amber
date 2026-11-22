use serde::Serialize;

pub const PDF_IMPORT_PROGRESS_EVENT: &str = "pdf-import-progress";

/// How far a PDF extraction got, for the request `request_id` started.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfImportProgressEventDto {
    pub request_id: String,
    pub done: usize,
    pub total: usize,
}
