use async_trait::async_trait;
use rig::agent::Agent;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::services::ai_client_provider::AiClientProviderError;
use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;

#[derive(Error, Debug)]
pub enum AgentProviderError {
    #[error(transparent)]
    AiClientProvider(#[from] AiClientProviderError),
    #[error(transparent)]
    Repository(#[from] RepositoryError),
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    async fn get_agent(
        &self,
        chat_id: Uuid,
        messages: &[Message],
        element_id: Option<ElementId>,
        context_snippets: &[String],
    ) -> Result<Agent, AgentProviderError>;
}
