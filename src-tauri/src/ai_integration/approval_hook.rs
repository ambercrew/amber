use std::collections::HashSet;
use std::sync::Arc;

use rig::agent::{AgentHook, HookContext, ToolCall, ToolCallAction};

use crate::ai_integration::entities::message::ApprovalStatus;
use crate::ai_integration::prompts::approval_result_text;

/// Holds back calls to tools that need approval; `ToolApprovalResolver` runs them once approved.
#[derive(Clone, Default)]
pub struct ApprovalHook {
    approval_required: Arc<HashSet<&'static str>>,
}

impl ApprovalHook {
    pub fn new(approval_required: Arc<HashSet<&'static str>>) -> Self {
        Self { approval_required }
    }

    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.approval_required.contains(tool_name)
    }
}

impl AgentHook for ApprovalHook {
    async fn on_tool_call(&self, _ctx: &HookContext, event: ToolCall<'_>) -> ToolCallAction {
        if self.requires_approval(event.tool_name) {
            ToolCallAction::Skip(approval_result_text(ApprovalStatus::Pending, None))
        } else {
            ToolCallAction::Run
        }
    }
}
