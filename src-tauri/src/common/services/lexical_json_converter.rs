use async_trait::async_trait;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LexicalJsonConverterError {
    #[error("Failed to notify the frontend of the pending conversion")]
    Emit,
    #[error("The frontend did not respond to the conversion request in time")]
    Timeout,
    #[error("{0}")]
    Failed(String),
}

/// Converts Markdown into serialized Lexical editor state JSON
#[async_trait]
pub trait LexicalJsonConverter: Send + Sync {
    async fn convert_markdown(&self, markdown: &str) -> Result<String, LexicalJsonConverterError>;
}
