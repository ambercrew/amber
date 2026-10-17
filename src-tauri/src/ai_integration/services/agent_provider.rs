use async_trait::async_trait;
use rig::agent::Agent;
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::approval_hook::ApprovalHook;
use crate::ai_integration::entities::message::Message;
use crate::ai_integration::services::ai_client_provider::AiClientProviderError;
use crate::ai_integration::services::tools_provider::ToolsProviderError;
use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;

#[derive(Error, Debug)]
pub enum AgentProviderError {
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error(transparent)]
    Tools(#[from] ToolsProviderError),
}

/// An agent and the hook that holds back its calls needing approval, to add to each request.
pub struct AppAgent {
    pub agent: Agent,
    pub approval_hook: ApprovalHook,
    /// What its tools were built from, saved with each call awaiting approval to run it later.
    pub tools_context: Value,
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    async fn get_agent(
        &self,
        chat_id: Uuid,
        messages: &[Message],
        element_id: Option<ElementId>,
    ) -> Result<AppAgent, AgentProviderError>;
}
