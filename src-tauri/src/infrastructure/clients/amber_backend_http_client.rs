use std::{
    io::{BufReader, Cursor},
    sync::Arc,
    time::Duration,
};

use crate::backend::{
    backend_dto::{
        ProblemDetails, SignInDto, SignUpDto, UpdatePasswordDto, UpdateUserInformationDto,
        UserInformationDto, VerifyEmailDto,
    },
    clients::amber_backend_client::{AmberBackendClient, AmberBackendClientError},
    dto::sign_up_request_dto::SignUpRequestDto,
};
use crate::generated_code::{ChangeBatch, PullResponse};
use crate::secrets::repositories::secrets_repository::SecretsRepository;
use async_trait::async_trait;
use reqwest_cookie_store::CookieStoreMutex;
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{RetryError, RetryTransientMiddleware, policies::ExponentialBackoff};
use tauri_plugin_http::reqwest::{Response, StatusCode, Url};

const COOKIES_SECRET_KEY: &str = "backend-cookies";

pub struct AmberBackendHttpClient {
    backend_url: Url,
    reqwest_client: ClientWithMiddleware,
    cookie_store: Arc<CookieStoreMutex>,
    secrets_repository: Arc<dyn SecretsRepository>,
}

impl AmberBackendHttpClient {
    pub async fn new(
        backend_url: Url,
        secrets_repository: Arc<dyn SecretsRepository>,
    ) -> Result<Self, String> {
        let mut cookie_store = reqwest_cookie_store::CookieStore::new();

        if let Some(cookies) = secrets_repository.get_secret(COOKIES_SECRET_KEY).await {
            let cursor = Cursor::new(cookies);
            let reader = BufReader::new(cursor);
            if let Ok(result) = cookie_store::serde::json::load(reader) {
                cookie_store = result;
            }
        } else {
            log::info!("The application was not able to load stored cookies.")
        }

        let cookie_store = reqwest_cookie_store::CookieStoreMutex::new(cookie_store);
        let cookie_store = std::sync::Arc::new(cookie_store);

        let reqwest_client = tauri_plugin_http::reqwest::Client::builder()
            .cookie_provider(cookie_store.clone())
            .build();

        if let Err(err) = reqwest_client {
            return Err(err.to_string());
        }

        #[cfg(debug_assertions)]
        log::info!(
            "Loaded the following cookies from keyring entry: {:#?}",
            cookie_store.lock().unwrap()
        );

        let retry_policy = ExponentialBackoff::builder()
            .retry_bounds(Duration::from_secs(2), Duration::from_secs(30))
            .build_with_max_retries(3);

        let client_with_middleware = ClientBuilder::new(reqwest_client.unwrap())
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Ok(Self {
            backend_url,
            reqwest_client: client_with_middleware,
            cookie_store,
            secrets_repository,
        })
    }
}

#[async_trait]
impl AmberBackendClient for AmberBackendHttpClient {
    async fn sign_in(
        &self,
        username: String,
        password: String,
    ) -> Result<UserInformationDto, AmberBackendClientError> {
        let dto = SignInDto { username, password };

        log::info!("Signing-in...");
        let response = self
            .reqwest_client
            .post(self.backend_url.join("/api/v1/auth/sign-in").unwrap())
            .json(&dto)
            .send()
            .await;

        let status = ensure_success_response(response).await;

        if let Err(ref err) = status
            && err == &AmberBackendClientError::Unauthorized
        {
            return Err(AmberBackendClientError::InvalidCredentials);
        }
        let response = status?;

        self.persist_cookies().await?;

        match response.json::<UserInformationDto>().await {
            Ok(result) => Ok(result),
            Err(err) => Err(AmberBackendClientError::Deserialization(Box::new(err))),
        }
    }

    async fn sign_up(
        &self,
        request: SignUpRequestDto,
    ) -> Result<UserInformationDto, AmberBackendClientError> {
        let dto = SignUpDto {
            first_name: request.first_name,
            last_name: request.last_name,
            email: request.email,
            password: request.password,
            username: request.username,
        };

        log::info!("Signing-up...");
        let response = self
            .reqwest_client
            .post(self.backend_url.join("/api/v1/auth/sign-up").unwrap())
            .json(&dto)
            .send()
            .await;

        let response = ensure_success_response(response).await?;
        self.persist_cookies().await?;

        match response.json::<UserInformationDto>().await {
            Ok(result) => Ok(result),
            Err(err) => Err(AmberBackendClientError::Deserialization(Box::new(err))),
        }
    }

    async fn sign_out(&self) -> Result<(), AmberBackendClientError> {
        log::info!("Signing-out...");
        let response = self
            .reqwest_client
            .post(self.backend_url.join("/api/v1/auth/sign-out").unwrap())
            .send()
            .await;
        ensure_success_response(response).await?;
        self.persist_cookies().await?;
        Ok(())
    }

    async fn verify_user_email(
        &self,
        verification_code: String,
    ) -> Result<(), AmberBackendClientError> {
        log::info!("Verifying email with code '{verification_code}'");

        let dto = VerifyEmailDto {
            email_verification_code: verification_code,
        };

        let response = self
            .reqwest_client
            .post(self.backend_url.join("/api/v1/auth/verify-email").unwrap())
            .json(&dto)
            .send()
            .await;

        ensure_success_response(response).await?;
        self.persist_cookies().await?;

        Ok(())
    }

    async fn resend_email_verification_code(&self) -> Result<(), AmberBackendClientError> {
        let response = self
            .reqwest_client
            .post(
                self.backend_url
                    .join("/api/v1/auth/resend-verification")
                    .unwrap(),
            )
            .send()
            .await;

        ensure_success_response(response).await?;
        Ok(())
    }

    async fn get_user_information(&self) -> Result<UserInformationDto, AmberBackendClientError> {
        let response = self
            .reqwest_client
            .get(self.backend_url.join("/api/v1/user").unwrap())
            .send()
            .await;

        let response = ensure_success_response(response).await?;
        match response.json::<UserInformationDto>().await {
            Ok(result) => Ok(result),
            Err(err) => Err(AmberBackendClientError::Deserialization(Box::new(err))),
        }
    }

    fn is_signed_in(&self) -> Result<bool, AmberBackendClientError> {
        let store = match self.cookie_store.lock() {
            Ok(store) => store,
            Err(err) => {
                log::error!("Cookie store mutex poisoned: {:?}", err);
                return Err(AmberBackendClientError::CannotLoadStoredCookies);
            }
        };

        for cookie in store.iter_unexpired() {
            if cookie.name() == ".AspNetCore.Cookies" {
                return Ok(true);
            }
        }

        Ok(false)
    }

    async fn update_user_information(
        &self,
        first_name: Option<String>,
        last_name: Option<String>,
    ) -> Result<(), AmberBackendClientError> {
        let dto = UpdateUserInformationDto {
            first_name,
            last_name,
        };

        log::info!("Updating user information...");
        let response = self
            .reqwest_client
            .patch(self.backend_url.join("/api/v1/user").unwrap())
            .json(&dto)
            .send()
            .await;

        ensure_success_response(response).await?;

        Ok(())
    }

    async fn delete_user(&self) -> Result<(), AmberBackendClientError> {
        log::info!("Deleting user email.");

        let response = self
            .reqwest_client
            .delete(self.backend_url.join("/api/v1/user").unwrap())
            .send()
            .await;

        ensure_success_response(response).await?;
        self.persist_cookies().await?;

        Ok(())
    }

    async fn update_password(&self, dto: UpdatePasswordDto) -> Result<(), AmberBackendClientError> {
        log::info!("Updating user password.");

        let response = self
            .reqwest_client
            .post(
                self.backend_url
                    .join("/api/v1/auth/update-password")
                    .unwrap(),
            )
            .json(&dto)
            .send()
            .await;

        ensure_success_response(response).await?;
        self.persist_cookies().await?;

        Ok(())
    }

    // TODO: no backend sync endpoint exists yet.
    async fn push_changes(&self, _batch: ChangeBatch) -> Result<(), AmberBackendClientError> {
        unimplemented!("the backend has no sync endpoint yet")
    }

    // TODO: no backend sync endpoint exists yet.
    async fn pull_changes(
        &self,
        _since_server_seq: Option<i64>,
    ) -> Result<PullResponse, AmberBackendClientError> {
        unimplemented!("the backend has no sync endpoint yet")
    }
}

impl AmberBackendHttpClient {
    async fn persist_cookies(&self) -> Result<(), AmberBackendClientError> {
        let cookies_json = {
            let mut writer = std::io::BufWriter::new(Vec::new());
            let store = match self.cookie_store.lock() {
                Ok(store) => store,
                Err(err) => {
                    log::error!("Cookie store mutex poisoned: {:?}", err);
                    return Err(AmberBackendClientError::CannotLoadStoredCookies);
                }
            };
            cookie_store::serde::json::save(&store, &mut writer).unwrap();
            String::from_utf8(writer.into_inner().unwrap()).unwrap()
            // store (MutexGuard) dropped here, before the await below
        };

        #[cfg(debug_assertions)]
        log::info!("Saving the following cookies to keyring: {cookies_json}");
        if let Err(err) = self
            .secrets_repository
            .set_secret(COOKIES_SECRET_KEY, &cookies_json)
            .await
        {
            return Err(AmberBackendClientError::CannotSaveAuthenticationCookies(
                Box::new(err),
            ));
        }

        Ok(())
    }
}

/// Ensures that there was no error sending the response and that
/// the status code of the response is 200, otherwise convert to an
/// appropriate error.
/// On 400 response it tries to parse the problem details and return it in a
/// an appropriate error.
async fn ensure_success_response(
    response: Result<Response, reqwest_middleware::Error>,
) -> Result<Response, AmberBackendClientError> {
    if let Err(err) = response {
        // reqwest_retry wraps the final error as:
        //   reqwest_middleware::Error::Middleware(anyhow<RetryError>)
        // so we must unwrap through RetryError to reach the reqwest::Error.
        let inner = match &err {
            reqwest_middleware::Error::Reqwest(_) => Some(&err),
            reqwest_middleware::Error::Middleware(e) => {
                e.downcast_ref::<RetryError>()
                    .map(|retry_err| match retry_err {
                        RetryError::WithRetries { err, .. } => err,
                        RetryError::Error(err) => err,
                    })
            }
        };

        if inner.is_some_and(|e| e.is_connect()) {
            return Err(AmberBackendClientError::Connect);
        } else if inner.is_some_and(|e| e.is_timeout()) {
            return Err(AmberBackendClientError::Timeout);
        } else {
            return Err(AmberBackendClientError::Unknown(Box::new(err)));
        }
    }

    let response = response.unwrap();

    #[cfg(debug_assertions)]
    log::info!("Response Status {}", response.status());

    #[cfg(debug_assertions)]
    log::info!("{response:#?}");

    match response.status() {
        status if status.is_success() => Ok(response),
        StatusCode::UNAUTHORIZED => Err(AmberBackendClientError::Unauthorized),
        StatusCode::BAD_REQUEST => match response.json::<ProblemDetails>().await {
            Ok(problem_details) => Err(AmberBackendClientError::BadRequest(problem_details.detail)),
            Err(err) => Err(AmberBackendClientError::Deserialization(Box::new(err))),
        },
        _ => Err(AmberBackendClientError::UnexpectedResponse),
    }
}
