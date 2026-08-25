use crate::backend::dto::sign_up_request_dto::SignUpRequestDto;
use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use thiserror::Error;

use crate::SourceError;
use crate::backend::backend_dto::{UpdatePasswordDto, UserInformationDto};
use crate::generated_code::{ChangeBatch, PullResponse};

#[derive(Error, Debug)]
pub enum AmberBackendClientError {
    #[error("Invalid credentials!")]
    InvalidCredentials,
    #[error("Unauthorized!")]
    Unauthorized,
    #[error("The application received an unexpected response!")]
    UnexpectedResponse,
    #[error("An unknown error occurred while sending the request")]
    Unknown(#[source] SourceError),
    #[error("Failed to deserialize the response")]
    Deserialization(#[source] SourceError),
    #[error("{0}")]
    BadRequest(String),
    #[error("Failed to connect to the server, please try again!")]
    Connect,
    #[error("The request timed out, please try again!")]
    Timeout,
    #[error("Cannot save authentication token")]
    CannotSaveAuthenticationToken(#[source] SourceError),
    #[error("Cannot load stored authentication token")]
    CannotLoadStoredAuthenticationToken,
    #[error("{0}")]
    InsufficientStorage(String),
}

impl PartialEq for AmberBackendClientError {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::BadRequest(a), Self::BadRequest(b)) => a == b,
            (Self::InsufficientStorage(a), Self::InsufficientStorage(b)) => a == b,
            _ => std::mem::discriminant(self) == std::mem::discriminant(other),
        }
    }
}

impl Eq for AmberBackendClientError {}

#[cfg_attr(test, automock)]
#[async_trait]
pub trait AmberBackendClient: Send + Sync {
    async fn sign_in(
        &self,
        username: String,
        password: String,
    ) -> Result<UserInformationDto, AmberBackendClientError>;

    async fn sign_in_with_google(
        &self,
        id_token: String,
    ) -> Result<UserInformationDto, AmberBackendClientError>;

    async fn sign_up(
        &self,
        request: SignUpRequestDto,
    ) -> Result<UserInformationDto, AmberBackendClientError>;

    async fn sign_out(&self) -> Result<(), AmberBackendClientError>;

    async fn verify_user_email(
        &self,
        verification_code: String,
    ) -> Result<(), AmberBackendClientError>;

    async fn resend_email_verification_code(&self) -> Result<(), AmberBackendClientError>;

    async fn get_user_information(&self) -> Result<UserInformationDto, AmberBackendClientError>;

    fn is_signed_in(&self) -> Result<bool, AmberBackendClientError>;

    async fn update_user_information(
        &self,
        first_name: Option<String>,
        last_name: Option<String>,
    ) -> Result<(), AmberBackendClientError>;

    async fn delete_user(&self) -> Result<(), AmberBackendClientError>;

    async fn update_password(&self, dto: UpdatePasswordDto) -> Result<(), AmberBackendClientError>;

    /// Pushes this device's local changes to the backend.
    async fn push_changes(&self, batch: ChangeBatch) -> Result<(), AmberBackendClientError>;

    /// Pulls remote changes since `since_server_seq` (`None` for a full pull).
    async fn pull_changes(
        &self,
        since_server_seq: Option<i64>,
    ) -> Result<PullResponse, AmberBackendClientError>;
}
