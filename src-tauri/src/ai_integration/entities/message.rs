use chrono::{DateTime, Utc};
use rig::message::{AssistantContent, AssistantMessage, CallId, ToolName, UserContent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ai_integration::prompts::with_context_snippets;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    id: Uuid,
    created_date: DateTime<Utc>,
    chat_id: Uuid,
    content: MessageContent,
}

impl Message {
    pub fn new(id: Option<Uuid>, chat_id: Uuid, content: MessageContent) -> Self {
        Self {
            id: id.unwrap_or(Uuid::new_v4()),
            created_date: Utc::now(),
            chat_id,
            content,
        }
    }

    pub fn new_unchecked(
        id: Uuid,
        created_date: DateTime<Utc>,
        chat_id: Uuid,
        content: MessageContent,
    ) -> Self {
        Self {
            id,
            chat_id,
            created_date,
            content,
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    pub fn created_date(&self) -> DateTime<Utc> {
        self.created_date
    }

    pub fn chat_id(&self) -> Uuid {
        self.chat_id
    }

    pub fn content(&self) -> &MessageContent {
        &self.content
    }

    pub(in crate::ai_integration) fn content_mut(&mut self) -> &mut MessageContent {
        &mut self.content
    }

    pub fn try_into_rig_message(
        self,
        context_snippets: &[String],
    ) -> Result<rig::message::Message, UnsupportedMessageContent> {
        match self.content {
            MessageContent::Human(content) => Ok(rig::message::Message::User {
                content: vec![UserContent::text(with_context_snippets(
                    &content,
                    context_snippets,
                ))],
            }),
            MessageContent::Document(DocumentContent { file_name }) => {
                Ok(rig::message::Message::User {
                    content: vec![UserContent::text(format!(
                        "I have uploaded the following file: {file_name}"
                    ))],
                })
            }
            MessageContent::Assistant(content) => Ok(rig::message::Message::assistant(content)),
            MessageContent::ToolCall(ToolCallContent {
                id,
                name,
                arguments,
                ..
            }) => Ok(rig::message::Message::Assistant(AssistantMessage::new(
                vec![AssistantContent::ToolCall(rig::message::ToolCall::new(
                    CallId::from_wire(id),
                    rig::message::ToolFunction::new(tool_name(name), arguments),
                ))],
            ))),
            MessageContent::ToolResult(ToolResultContent { id, name, text }) => Ok(
                rig::message::Message::tool_result(CallId::from_wire(id), tool_name(name), text),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "value")]
pub enum MessageContent {
    Human(String),
    Document(DocumentContent),
    Assistant(String),
    ToolCall(ToolCallContent),
    ToolResult(ToolResultContent),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub file_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallContent {
    pub(in crate::ai_integration) id: String,
    pub(in crate::ai_integration) name: String,
    pub(in crate::ai_integration) arguments: Value,
    /// Set on calls to tools that only run once the user approves them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(in crate::ai_integration) approval: Option<ToolApproval>,
}

/// The user's decision on a tool call awaiting their approval.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolApproval {
    /// What the tool needs besides its arguments to run later, captured when the call was made.
    #[serde(default)]
    pub(in crate::ai_integration) context: Value,
    pub(in crate::ai_integration) status: ApprovalStatus,
    /// What the tool returned when it ran after being approved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(in crate::ai_integration) output: Option<String>,
}

impl ToolApproval {
    pub(in crate::ai_integration) fn pending(context: Value) -> Self {
        Self {
            context,
            status: ApprovalStatus::Pending,
            output: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultContent {
    pub(in crate::ai_integration) id: String,
    #[serde(default)]
    pub(in crate::ai_integration) name: String,
    pub(in crate::ai_integration) text: String,
}

impl From<rig::message::ToolCall> for ToolCallContent {
    fn from(tool_call: rig::message::ToolCall) -> Self {
        Self {
            id: tool_call.id.wire().into_owned(),
            arguments: tool_call.function.arguments_value(),
            name: tool_call.function.name.to_string(),
            approval: None,
        }
    }
}

impl From<rig::message::ToolResult> for ToolResultContent {
    fn from(tool_result: rig::message::ToolResult) -> Self {
        let text = tool_result
            .content
            .into_iter()
            .find_map(|c| {
                if let rig::message::ToolResultContent::Text(t) = c {
                    Some(t.text)
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "Tool called successfully".to_string());

        Self {
            id: tool_result.call.wire().into_owned(),
            name: tool_result.name.to_string(),
            text,
        }
    }
}

/// Results stored before tool names were saved have none, and rig needs one.
fn tool_name(name: String) -> ToolName {
    ToolName::new(name).unwrap_or_else(|_| ToolName::new("tool").expect("a non-empty name"))
}

#[derive(Debug)]
pub struct UnsupportedMessageContent;

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    fn try_into_rig_message_human_with_context_snippets_folded_snippets_into_text() {
        // Arrange

        let message = Message::new(
            None,
            Uuid::new_v4(),
            MessageContent::Human("What does this mean?".to_string()),
        );

        // Act

        let actual = message
            .try_into_rig_message(&["Selected passage".to_string()])
            .unwrap();

        // Assert

        let rig::message::Message::User { content } = actual else {
            panic!("Expected a user message");
        };
        let Some(UserContent::Text(text)) = content.first() else {
            panic!("Expected text content");
        };
        assert!(text.text.contains("What does this mean?"));
        assert!(text.text.contains("Selected passage"));
    }

    #[test]
    fn try_into_rig_message_human_without_context_snippets_did_not_add_context_section() {
        // Arrange

        let message = Message::new(
            None,
            Uuid::new_v4(),
            MessageContent::Human("What does this mean?".to_string()),
        );

        // Act

        let actual = message.try_into_rig_message(&[]).unwrap();

        // Assert

        let rig::message::Message::User { content } = actual else {
            panic!("Expected a user message");
        };
        let Some(UserContent::Text(text)) = content.first() else {
            panic!("Expected text content");
        };
        assert_eq!(text.text, "What does this mean?");
    }
}
