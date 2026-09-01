use chrono::{DateTime, Utc};
use rig::{
    agent::Text,
    message::{AssistantContent, ProviderCallId, ToolCallId, UserContent},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ai_integration::prompts::format_context_snippets;

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

    pub fn try_into_rig_message(
        self,
        context_snippets: &[String],
    ) -> Result<rig::message::Message, UnsupportedMessageContent> {
        match self.content {
            MessageContent::Human(content) => {
                let text = match format_context_snippets(context_snippets) {
                    Some(context) => format!("{content}\n\n**Context:**\n{context}"),
                    None => content,
                };
                Ok(rig::message::Message::User {
                    content: vec![UserContent::text(text)],
                })
            }
            MessageContent::Document(DocumentContent { file_name }) => {
                Ok(rig::message::Message::User {
                    content: vec![UserContent::text(format!(
                        "I have uploaded the following file: {file_name}"
                    ))],
                })
            }
            MessageContent::Assistant(content) => Ok(rig::message::Message::Assistant {
                id: None,
                content: vec![AssistantContent::Text(Text {
                    text: content,
                    additional_params: None,
                })],
            }),
            MessageContent::ToolCall(ToolCallContent {
                id,
                name,
                arguments,
            }) => {
                let provider = ProviderCallId::new(id);
                Ok(rig::message::Message::Assistant {
                    id: None,
                    content: vec![AssistantContent::ToolCall(rig::message::ToolCall {
                        id: ToolCallId::for_provider(provider.as_ref()),
                        provider,
                        function: rig::message::ToolFunction { name, arguments },
                        signature: None,
                        additional_params: None,
                    })],
                })
            }
            MessageContent::ToolResult(ToolResultContent { id, name, text }) => {
                let provider = ProviderCallId::new(id);
                Ok(rig::message::Message::User {
                    content: vec![UserContent::ToolResult(rig::message::ToolResult {
                        call: ToolCallId::for_provider(provider.as_ref()),
                        provider,
                        name,
                        content: vec![rig::message::ToolResultContent::text(text)],
                    })],
                })
            }
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
            id: provider_or_handle(tool_call.provider, tool_call.id),
            name: tool_call.function.name,
            arguments: tool_call.function.arguments,
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
            id: provider_or_handle(tool_result.provider, tool_result.call),
            name: tool_result.name,
            text,
        }
    }
}

/// The identifier to persist for a tool call or its result: the provider's own
/// id when it issued one, otherwise rig's minted correlation handle.
fn provider_or_handle(provider: Option<ProviderCallId>, handle: ToolCallId) -> String {
    provider
        .map(|provider| provider.call_id)
        .unwrap_or_else(|| handle.into_string())
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
