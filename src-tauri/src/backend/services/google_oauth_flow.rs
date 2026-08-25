use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
    time::timeout,
};

#[derive(Error, Debug)]
pub enum GoogleOAuthError {
    #[error("Failed to start the local OAuth callback server")]
    CannotStartCallbackServer,
    #[error("Failed to open the system browser")]
    CannotOpenBrowser,
    #[error("Timed out waiting for the Google sign-in redirect")]
    Timeout,
    #[error("The Google sign-in redirect was invalid")]
    InvalidRedirect,
    #[error("Google sign-in was cancelled or denied")]
    Denied,
    #[error("Failed to exchange the authorization code for a token: {0}")]
    TokenExchangeFailed(String),
}

const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REDIRECT_TIMEOUT: Duration = Duration::from_secs(120);
const GOOGLE_OAUTH_CLIENT_ID: &str =
    "3909155312-6eeg64kqlmkonjsq0qdpl0ug6tajil87.apps.googleusercontent.com";
// Google's token endpoint requires client_secret even for Desktop/installed
// app clients using PKCE. Per Google's own docs this value isn't treated as
// confidential for installed apps (unlike Web-app clients), so embedding it
// here is expected: https://developers.google.com/identity/protocols/oauth2/native-app
const GOOGLE_OAUTH_CLIENT_SECRET: &str = "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";
const REDIRECT_RESPONSE_BODY: &str = "You can close this tab and return to Amber.";

/// Runs an interactive "Sign in with Google" flow (Authorization Code +
/// PKCE) using the system browser and a short-lived local callback server,
/// and returns the Google-issued ID token to hand to the Amber backend's
/// `google-sign-in` endpoint (which verifies it directly with Google).
///
/// The callback server is a bare `tokio::net::TcpListener` we drive
/// ourselves rather than a Tauri plugin (e.g. `tauri-plugin-oauth`): that
/// plugin isn't part of the `tauri-apps/plugins-workspace` repo this
/// project's `[patch.crates-io]` redirects to the `feat/cef` fork, so it
/// pulls in an unpatched `tauri` from crates.io alongside the patched one
/// and crashes at runtime. Rolling our own loopback server needs nothing
/// beyond `tokio`, which is already a full-featured dependency.
///
/// Works on both desktop and mobile: the callback server binds to
/// `127.0.0.1` on the device itself, and the system browser the OS opens
/// runs on that same device, so it can always reach the loopback redirect
/// regardless of platform.
pub async fn run<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
) -> Result<String, GoogleOAuthError> {
    let code_verifier = generate_random_url_safe_string();
    let code_challenge = code_challenge(&code_verifier);
    let state = generate_random_url_safe_string();

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| GoogleOAuthError::CannotStartCallbackServer)?;
    let port = listener
        .local_addr()
        .map_err(|_| GoogleOAuthError::CannotStartCallbackServer)?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{port}");
    let authorize_url = build_authorize_url(&redirect_uri, &code_challenge, &state);

    let (redirect_tx, redirect_rx) = oneshot::channel::<String>();
    tokio::spawn(accept_redirect(listener, redirect_tx));

    if app_handle
        .opener()
        .open_url(authorize_url, None::<&str>)
        .is_err()
    {
        return Err(GoogleOAuthError::CannotOpenBrowser);
    }

    let redirect_path = timeout(REDIRECT_TIMEOUT, redirect_rx)
        .await
        .map_err(|_| GoogleOAuthError::Timeout)?
        .map_err(|_| GoogleOAuthError::InvalidRedirect)?;

    let code = extract_authorization_code(&redirect_path, &state)?;

    exchange_code_for_id_token(&code, &code_verifier, &redirect_uri).await
}

/// Accepts the single loopback connection carrying the OAuth redirect,
/// replies with a static "you can close this tab" page, and forwards the
/// request's path + query string to the waiting `run` call. Runs as its own
/// task because the listener has to be alive *before* the browser is
/// opened, but the request only arrives after the user finishes the consent
/// screen.
async fn accept_redirect(listener: TcpListener, redirect_tx: oneshot::Sender<String>) {
    let Ok((mut stream, _)) = listener.accept().await else {
        return;
    };

    let mut buf = [0u8; 8192];
    let Ok(n) = stream.read(&mut buf).await else {
        return;
    };

    let request = String::from_utf8_lossy(&buf[..n]);
    let Some(path) = request
        .lines()
        .next()
        .and_then(|request_line| request_line.split_whitespace().nth(1))
    else {
        return;
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        REDIRECT_RESPONSE_BODY.len(),
        REDIRECT_RESPONSE_BODY
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
    let _ = redirect_tx.send(path.to_string());
}

fn generate_random_url_safe_string() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge(code_verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()))
}

fn build_authorize_url(redirect_uri: &str, code_challenge: &str, state: &str) -> String {
    let mut url =
        tauri::Url::parse(GOOGLE_AUTH_ENDPOINT).expect("Cannot construct Google authorize URL");
    url.query_pairs_mut()
        .append_pair("client_id", GOOGLE_OAUTH_CLIENT_ID)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state);
    url.to_string()
}

fn extract_authorization_code(
    redirect_path: &str,
    expected_state: &str,
) -> Result<String, GoogleOAuthError> {
    let url = tauri::Url::options()
        .base_url(Some(
            &tauri::Url::parse("http://127.0.0.1").expect("Cannot construct placeholder base URL"),
        ))
        .parse(redirect_path)
        .map_err(|_| GoogleOAuthError::InvalidRedirect)?;

    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();

    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err(GoogleOAuthError::InvalidRedirect);
    }

    params.get("code").cloned().ok_or(GoogleOAuthError::Denied)
}

async fn exchange_code_for_id_token(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<String, GoogleOAuthError> {
    #[derive(serde::Deserialize)]
    struct TokenResponse {
        id_token: String,
    }

    let client = tauri_plugin_http::reqwest::Client::new();
    let response = client
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&[
            ("client_id", GOOGLE_OAUTH_CLIENT_ID),
            ("client_secret", GOOGLE_OAUTH_CLIENT_SECRET),
            ("code", code),
            ("code_verifier", code_verifier),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|err| GoogleOAuthError::TokenExchangeFailed(err.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<no response body>".to_string());
        return Err(GoogleOAuthError::TokenExchangeFailed(format!(
            "Google returned HTTP {status}: {body}"
        )));
    }

    response
        .json::<TokenResponse>()
        .await
        .map(|body| body.id_token)
        .map_err(|err| GoogleOAuthError::TokenExchangeFailed(err.to_string()))
}
