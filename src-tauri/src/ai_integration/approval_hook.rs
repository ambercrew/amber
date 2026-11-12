use std::collections::HashSet;
use std::sync::Arc;

use rig::agent::{AgentHook, DispatchAction, DispatchEvent, HookContext};

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
    async fn on_dispatch(&self, _ctx: &HookContext, event: DispatchEvent<'_>) -> DispatchAction {
        match event.tool_name() {
            Some(name) if self.requires_approval(name) => {
                DispatchAction::skip(approval_result_text(ApprovalStatus::Pending, None))
            }
            _ => DispatchAction::Proceed,
        }
    }
}
