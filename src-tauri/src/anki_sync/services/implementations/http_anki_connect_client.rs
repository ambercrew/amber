use std::time::Duration;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::anki_sync::anki_connect::{AnkiConnectClient, AnkiConnectError};

/// AnkiConnect's default address; it only listens locally.
const ANKI_CONNECT_URL: &str = "http://127.0.0.1:8765";
const API_VERSION: u8 = 6;
/// Importing, exporting or carrying a large package can take minutes.
const PACKAGE_TIMEOUT: Duration = Duration::from_secs(300);
/// Everything else answers quickly, so a stuck Anki shows up as an error soon.
const TIMEOUT: Duration = Duration::from_secs(60);

fn timeout(action: &str) -> Duration {
    match action {
        "importPackage" | "exportPackage" | "storeMediaFile" | "retrieveMediaFile" => {
            PACKAGE_TIMEOUT
        }
        _ => TIMEOUT,
    }
}

#[derive(Deserialize)]
struct Response {
    result: Value,
    error: Option<String>,
}

pub struct HttpAnkiConnectClient {
    client: reqwest::Client,
}

#[async_trait]
impl ScopeInjectable for HttpAnkiConnectClient {
    async fn from_injector_scope(_scope: &InjectorScope<'_>) -> Self {
        // AnkiConnect is local, so a configured proxy could only get in the way.
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .expect("a client without a proxy always builds");
        Self { client }
    }
}

#[async_trait]
impl AnkiConnectClient for HttpAnkiConnectClient {
    async fn invoke(&self, action: &'static str, params: Value) -> Result<Value, AnkiConnectError> {
        let body = json!({ "action": action, "version": API_VERSION, "params": params });
        let response = self
            .client
            .post(ANKI_CONNECT_URL)
            .timeout(timeout(action))
            .body(body.to_string())
            .send()
            .await
            .map_err(|_| AnkiConnectError::Unreachable)?;
        let text = response
            .text()
            .await
            .map_err(|_| AnkiConnectError::InvalidResponse)?;
        let response: Response =
            serde_json::from_str(&text).map_err(|_| AnkiConnectError::InvalidResponse)?;
        match response.error {
            Some(error) => Err(AnkiConnectError::Refused(error)),
            None => Ok(response.result),
        }
    }
}
