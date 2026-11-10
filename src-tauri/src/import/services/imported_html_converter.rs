use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ImportedHtmlConverterError {
    #[error("Failed to ask the frontend to convert the imported content")]
    Emit,
    #[error("The frontend did not convert the imported content in time")]
    Timeout,
    #[error("The frontend returned invalid converted content")]
    InvalidResponse,
    #[error("{0}")]
    Failed(String),
}

/// Converts imported HTML to Lexical JSON, which only the frontend can produce.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait ImportedHtmlConverter: Send + Sync {
    /// One Lexical JSON document per fragment, in order; images are sanitized and stored as in any import.
    async fn convert(&self, htmls: Vec<String>) -> Result<Vec<String>, ImportedHtmlConverterError>;
}
