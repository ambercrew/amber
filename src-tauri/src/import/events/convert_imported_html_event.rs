use serde::{Deserialize, Serialize};

pub const CONVERT_IMPORTED_HTML_EVENT: &str = "convert-imported-html";

/// HTML fragments to sanitize, localize the images of, and convert to Lexical JSON.
#[derive(Serialize, Clone)]
pub struct ConvertImportedHtmlEventDto {
    pub htmls: Vec<String>,
}

/// The frontend's answer: one Lexical JSON document per fragment, in order, or why it failed.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConvertImportedHtmlResponseDto {
    Contents(Vec<String>),
    Error(String),
}
