use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};
use serde_json::Value;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::common::event_manager::EventManager;

#[derive(Debug, Clone, PartialEq)]
struct AppEvent {
    name: String,
    body: Value,
}

#[derive(Default)]
struct QueuedEvents {
    events: Vec<AppEvent>,
    /// Name and body of each queued event; a bulk import queues thousands, so `events` isn't scanned.
    seen: HashSet<(String, String)>,
}

impl QueuedEvents {
    fn push(&mut self, name: &str, body: Value) {
        if self.seen.insert((name.to_string(), body.to_string())) {
            self.events.push(AppEvent {
                name: name.to_string(),
                body,
            });
        }
    }
}

pub struct TauriEventManager<R: tauri::Runtime> {
    app_handle: Arc<tauri::AppHandle<R>>,
    queue: Mutex<QueuedEvents>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriEventManager<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let app_handle = scope.resolve::<tauri::AppHandle<R>>().await;
        Self {
            app_handle,
            queue: Mutex::default(),
        }
    }
}

#[async_trait]
impl<R: tauri::Runtime> EventManager for TauriEventManager<R> {
    async fn push(&self, name: &str, body: Value) {
        self.queue.lock().await.push(name, body);
    }

    async fn emit_all(&self) {
        let events = std::mem::take(&mut *self.queue.lock().await).events;
        for event in events {
            if let Err(err) = self.app_handle.emit(&event.name, event.body) {
                log::error!("Failed to emit event '{}': {}", event.name, err);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn push_identical_event_queues_it_once() {
        // Arrange

        let mut queue = QueuedEvents::default();

        // Act

        queue.push("created", json!({ "id": 1 }));
        queue.push("created", json!({ "id": 1 }));

        // Assert

        assert_eq!(1, queue.events.len());
    }

    #[test]
    fn push_different_bodies_queues_both_in_order() {
        // Arrange

        let mut queue = QueuedEvents::default();

        // Act

        queue.push("created", json!({ "id": 1 }));
        queue.push("created", json!({ "id": 2 }));

        // Assert

        let bodies: Vec<_> = queue.events.iter().map(|event| &event.body).collect();
        assert_eq!(vec![&json!({ "id": 1 }), &json!({ "id": 2 })], bodies);
    }
}
