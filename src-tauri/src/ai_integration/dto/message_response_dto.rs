use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::ai_integration::entities::message::{Message, MessageContent};
use crate::ai_integration::tools::app_tools::ApprovalMarkdown;

/// A `Message` combined with the context snippets it was sent with, fetched
/// separately since they live in their own table. Only assembled where the
/// caller actually needs snippets (displaying a chat) rather than on every
/// message fetch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponseDto {
    id: Uuid,
    created_date: DateTime<Utc>,
    chat_id: Uuid,
    content: MessageContent,
    context_snippets: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    approval_markdown: Option<String>,
    /// Added by the tool once an approved call ran; never stored.
    #[serde(skip_serializing_if = "Option::is_none")]
    approval_result_markdown: Option<String>,
}

impl MessageResponseDto {
    pub fn new(
        message: Message,
        context_snippets: Vec<String>,
        approval_markdown: Option<ApprovalMarkdown>,
    ) -> Self {
        let (approval_markdown, approval_result_markdown) = match approval_markdown {
            Some(ApprovalMarkdown { request, result }) => (Some(request), result),
            None => (None, None),
        };
        Self {
            id: message.id(),
            created_date: message.created_date(),
            chat_id: message.chat_id(),
            content: message.content().clone(),
            context_snippets,
            approval_markdown,
            approval_result_markdown,
        }
    }
}
