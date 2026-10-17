use std::collections::HashSet;
use std::sync::Arc;

use rig::tool::ToolSet;
use rig::tool::server::{ToolServer, ToolServerHandle};
use serde_json::Value;

use crate::ai_integration::approval_hook::ApprovalHook;
use crate::ai_integration::entities::message::Message;
use crate::ai_integration::tools::app_tool::AppTool;

/// An `AppTool` with its type erased, so the tools can go to an agent or a `ToolSet`.
trait ErasedTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn requires_approval(&self) -> bool;
    fn is_applicable(&self, messages: &[Message]) -> bool;
    fn approval_markdown(&self, arguments: &Value) -> Option<String>;
    fn approved_markdown(&self, arguments: &Value, output: &str) -> Option<String>;
    fn add_to_server(self: Box<Self>, server: ToolServer) -> ToolServer;
    fn add_to_set(self: Box<Self>, set: &mut ToolSet);
}

impl<T: AppTool> ErasedTool for T {
    fn name(&self) -> &'static str {
        T::NAME
    }

    fn requires_approval(&self) -> bool {
        T::REQUIRES_APPROVAL
    }

    fn is_applicable(&self, messages: &[Message]) -> bool {
        AppTool::is_applicable(self, messages)
    }

    fn approval_markdown(&self, arguments: &Value) -> Option<String> {
        let args = serde_json::from_value::<T::Args>(arguments.clone()).ok()?;
        AppTool::approval_markdown(self, &args)
    }

    fn approved_markdown(&self, arguments: &Value, output: &str) -> Option<String> {
        let args = serde_json::from_value::<T::Args>(arguments.clone()).ok()?;
        // Structured outputs are stored as JSON, plain-text ones as the text itself.
        let output = serde_json::from_str::<T::Output>(output)
            .or_else(|_| serde_json::from_value::<T::Output>(Value::String(output.to_string())))
            .ok()?;
        AppTool::approved_markdown(self, &args, &output)
    }

    fn add_to_server(self: Box<Self>, server: ToolServer) -> ToolServer {
        server.tool(*self)
    }

    fn add_to_set(self: Box<Self>, set: &mut ToolSet) {
        set.add_tool(*self);
    }
}

/// What the approval card shows for a call, written by its tool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalMarkdown {
    /// What the user is asked to approve.
    pub request: String,
    /// Added once the approved call ran, from what it returned.
    pub result: Option<String>,
}

/// Every tool there is; the agent is only given the ones applicable to its chat.
#[derive(Default)]
pub struct AppTools {
    tools: Vec<Box<dyn ErasedTool>>,
}

impl AppTools {
    pub fn tool<T: AppTool>(mut self, tool: T) -> Self {
        self.tools.push(Box::new(tool));
        self
    }

    /// The approval card's markdown for a call, or `None` when its tool runs without approval.
    /// `output` is what the call returned, once it was approved and ran.
    pub fn approval_markdown(
        &self,
        tool_name: &str,
        arguments: &Value,
        output: Option<&str>,
    ) -> Option<ApprovalMarkdown> {
        let tool = self
            .tools
            .iter()
            .find(|tool| tool.name() == tool_name && tool.requires_approval())?;
        Some(ApprovalMarkdown {
            request: tool
                .approval_markdown(arguments)
                .unwrap_or_else(|| raw_arguments_markdown(arguments)),
            result: output.and_then(|output| tool.approved_markdown(arguments, output)),
        })
    }

    /// Starts the tools applicable to the chat, returning the hook that holds back calls needing approval.
    pub fn into_agent_tools(self, messages: &[Message]) -> (ToolServerHandle, ApprovalHook) {
        let tools: Vec<_> = self
            .tools
            .into_iter()
            .filter(|tool| tool.is_applicable(messages))
            .collect();
        let approval_required: HashSet<_> = tools
            .iter()
            .filter(|tool| tool.requires_approval())
            .map(|tool| tool.name())
            .collect();
        let server = tools
            .into_iter()
            .fold(ToolServer::new(), |server, tool| tool.add_to_server(server));
        (server.run(), ApprovalHook::new(Arc::new(approval_required)))
    }

    /// Collects the tools to run a call directly, outside an agent.
    pub fn into_tool_set(self) -> ToolSet {
        let mut set = ToolSet::default();
        for tool in self.tools {
            tool.add_to_set(&mut set);
        }
        set
    }
}

fn raw_arguments_markdown(arguments: &Value) -> String {
    let json = serde_json::to_string_pretty(arguments).unwrap_or_else(|_| arguments.to_string());
    format!("```json\n{json}\n```")
}

#[cfg(test)]
mod tests {
    use rig::tool::{Tool, ToolContext};
    use serde::Deserialize;
    use serde_json::json;

    use super::*;

    #[derive(Deserialize)]
    struct TestArgs {
        text: String,
    }

    struct TestTool {
        has_markdown: bool,
        applicable: bool,
    }

    impl Tool for TestTool {
        const NAME: &'static str = "test_tool";

        type Error = std::convert::Infallible;
        type Args = TestArgs;
        type Output = String;

        fn description(&self) -> String {
            String::new()
        }

        fn parameters(&self) -> Value {
            json!({})
        }

        async fn call(
            &self,
            _context: &mut ToolContext,
            _args: Self::Args,
        ) -> Result<Self::Output, Self::Error> {
            Ok(String::new())
        }
    }

    impl AppTool for TestTool {
        const REQUIRES_APPROVAL: bool = true;

        fn is_applicable(&self, _messages: &[Message]) -> bool {
            self.applicable
        }

        fn approval_markdown(&self, args: &Self::Args) -> Option<String> {
            self.has_markdown.then(|| format!("Say **{}**?", args.text))
        }

        fn approved_markdown(&self, args: &Self::Args, output: &Self::Output) -> Option<String> {
            self.has_markdown
                .then(|| format!("Said {} and got {output}", args.text))
        }
    }

    #[test]
    fn approval_markdown_tool_with_markdown_returned_tools_markdown() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: true,
        });

        // Act

        let actual = tools.approval_markdown("test_tool", &json!({ "text": "hi" }), None);

        // Assert

        assert_eq!(
            Some(ApprovalMarkdown {
                request: "Say **hi**?".to_string(),
                result: None,
            }),
            actual
        );
    }

    #[test]
    fn approval_markdown_tool_without_markdown_returned_raw_arguments() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: false,
            applicable: true,
        });

        // Act

        let actual = tools.approval_markdown("test_tool", &json!({ "text": "hi" }), None);

        // Assert

        assert_eq!(
            Some("```json\n{\n  \"text\": \"hi\"\n}\n```".to_string()),
            actual.map(|markdown| markdown.request)
        );
    }

    #[test]
    fn approval_markdown_invalid_arguments_returned_raw_arguments() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: true,
        });

        // Act

        let actual = tools.approval_markdown("test_tool", &json!({ "other": 1 }), None);

        // Assert

        assert_eq!(
            Some("```json\n{\n  \"other\": 1\n}\n```".to_string()),
            actual.map(|markdown| markdown.request)
        );
    }

    #[test]
    fn approval_markdown_tool_not_requiring_approval_returned_none() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: true,
        });

        // Act

        let actual = tools.approval_markdown("other_tool", &json!({}), None);

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn approval_markdown_call_that_ran_added_tools_approved_markdown_from_its_output() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: true,
        });

        // Act

        let actual = tools.approval_markdown("test_tool", &json!({ "text": "hi" }), Some("hello"));

        // Assert

        assert_eq!(
            Some("Said hi and got hello".to_string()),
            actual.and_then(|markdown| markdown.result)
        );
    }

    #[tokio::test]
    async fn into_agent_tools_inapplicable_tool_left_out_of_approval_hook() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: false,
        });

        // Act

        let (_, approval_hook) = tools.into_agent_tools(&[]);

        // Assert

        assert!(!approval_hook.requires_approval("test_tool"));
    }

    #[tokio::test]
    async fn into_agent_tools_applicable_tool_requiring_approval_held_back_by_hook() {
        // Arrange

        let tools = AppTools::default().tool(TestTool {
            has_markdown: true,
            applicable: true,
        });

        // Act

        let (_, approval_hook) = tools.into_agent_tools(&[]);

        // Assert

        assert!(approval_hook.requires_approval("test_tool"));
    }
}
