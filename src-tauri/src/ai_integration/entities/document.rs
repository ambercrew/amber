use uuid::Uuid;

/// The text of one page of a PDF uploaded to a chat, or of a whole file of another kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub file_name: String,
    /// Orders a chat's documents: upload order, then page order.
    pub position: u32,
    /// The 1-based PDF page, `None` for other files.
    pub page: Option<u32>,
    pub content: String,
}
