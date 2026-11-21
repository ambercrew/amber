use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::ai_integration::entities::message::{Message, MessageContent};
use crate::ai_integration::tools::app_tools::{ApprovalMarkdown, ToolCallDescription};
use crate::elements::value_objects::element_id::ElementId;

/// A `Message` with the context snippets it was sent with, which live in their own table, so it's
/// only assembled where snippets are shown (a chat), not on every fetch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponseDto {
    id: Uuid,
    created_date: DateTime<Utc>,
    chat_id: Uuid,
    content: MessageContent,
    context_snippets: Vec<String>,
    /// Where a tool call's change lands; never stored.
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_location: Option<ElementId>,
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
        description: ToolCallDescription,
    ) -> Self {
        let (approval_markdown, approval_result_markdown) = match description.approval {
            Some(ApprovalMarkdown { request, result }) => (Some(request), result),
            None => (None, None),
        };
        Self {
            id: message.id(),
            created_date: message.created_date(),
            chat_id: message.chat_id(),
            content: message.content().clone(),
            context_snippets,
            tool_location: description.location,
            approval_markdown,
            approval_result_markdown,
        }
    }
}
