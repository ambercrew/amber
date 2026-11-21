use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use serde_json::Value;

/// Queues frontend-bound events during a request scope, deduplicated, and emits them only once
/// persistence has succeeded.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait EventManager: Send + Sync {
    async fn push(&self, name: &str, body: Value);
    async fn emit_all(&self);
}
