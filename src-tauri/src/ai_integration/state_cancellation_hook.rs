use std::sync::Arc;

use rig::agent::{
    AgentHook, CompletionCallAction, CompletionCallEvent, HookContext, ObservationAction,
    OutcomeAction, OutcomeEvent, TextDelta, ToolCallDelta,
};
use rig::effect::EffectKind;

use crate::ai_integration::ai_state::AiState;

const CANCELLED_REASON: &str = "Cancelled due to state update.";

/// Stops the run between model calls and while one streams. Tools aren't stopped:
/// rig keeps a batch's results only once every call in it settles, and a tool may
/// already have changed the user's data.
#[derive(Clone)]
pub struct StateCancellationHook {
    state: Arc<AiState>,
}

impl StateCancellationHook {
    pub fn new(state: Arc<AiState>) -> Self {
        Self { state }
    }

    fn cancelled(&self) -> bool {
        if self.state.generation_cancelled() {
            log::info!("Cancelling the generation of response.");
            true
        } else {
            false
        }
    }

    fn observation(&self) -> ObservationAction {
        if self.cancelled() {
            ObservationAction::stop(CANCELLED_REASON)
        } else {
            ObservationAction::Continue
        }
    }
}

impl AgentHook for StateCancellationHook {
    async fn on_completion_call(
        &self,
        _ctx: &HookContext,
        _event: CompletionCallEvent<'_>,
    ) -> CompletionCallAction {
        if self.cancelled() {
            CompletionCallAction::stop(CANCELLED_REASON)
        } else {
            CompletionCallAction::Continue
        }
    }

    async fn on_text_delta(&self, _ctx: &HookContext, _event: TextDelta<'_>) -> ObservationAction {
        self.observation()
    }

    async fn on_tool_call_delta(
        &self,
        _ctx: &HookContext,
        _event: ToolCallDelta<'_>,
    ) -> ObservationAction {
        self.observation()
    }

    async fn on_outcome(&self, _ctx: &HookContext, event: OutcomeEvent<'_>) -> OutcomeAction {
        if matches!(event.kind, EffectKind::Completion { .. }) && self.cancelled() {
            OutcomeAction::stop(CANCELLED_REASON)
        } else {
            OutcomeAction::Proceed
        }
    }
}
