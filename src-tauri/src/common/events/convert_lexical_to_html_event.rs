use serde::{Deserialize, Serialize};

pub const CONVERT_LEXICAL_TO_HTML_EVENT: &str = "convert-lexical-to-html";

/// Lexical JSON documents to render as HTML.
#[derive(Serialize, Clone)]
pub struct ConvertLexicalToHtmlEventDto {
    pub contents: Vec<String>,
}

/// The frontend's answer: one HTML fragment per document, in order, or why it failed.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConvertLexicalToHtmlResponseDto {
    Htmls(Vec<String>),
    Error(String),
}
