use rig::tool::Tool;
use serde::de::DeserializeOwned;

use crate::ai_integration::entities::message::Message;

/// Implemented by every tool the agent is given, on top of rig's `Tool`.
pub trait AppTool: Tool<Output: DeserializeOwned> + 'static {
    /// Whether calls wait for the user's approval and only run once they approve.
    const REQUIRES_APPROVAL: bool;

    /// Whether the agent is offered this tool in a chat with these messages.
    fn is_applicable(&self, _messages: &[Message]) -> bool {
        true
    }

    /// Markdown shown when asking the user to approve a call; `None` shows the raw arguments.
    fn approval_markdown(&self, _args: &Self::Args) -> Option<String> {
        None
    }

    /// Markdown added to the approval once the call ran, e.g. linking what it created.
    fn approved_markdown(&self, _args: &Self::Args, _output: &Self::Output) -> Option<String> {
        None
    }
}
