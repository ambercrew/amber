use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LexicalHtmlConverterError {
    #[error("Failed to notify the frontend of the pending conversion")]
    Emit,
    #[error("The frontend did not respond to the conversion request in time")]
    Timeout,
    #[error("The frontend sent an invalid conversion answer")]
    InvalidResponse,
    #[error("{0}")]
    Failed(String),
}

/// Renders serialized Lexical editor state JSON as HTML, which only the frontend can do.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait LexicalHtmlConverter: Send + Sync {
    /// One HTML fragment per document, in order; images keep their `amber-asset:` srcs.
    async fn convert_to_html(
        &self,
        contents: Vec<String>,
    ) -> Result<Vec<String>, LexicalHtmlConverterError>;
}
