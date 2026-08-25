use async_trait::async_trait;
use thiserror::Error;

use crate::{
    database::database_connection_manager::DatabaseConnectionManagerError,
    secrets::repositories::secrets_repository::SecretsRepositoryError,
    settings::{
        dto::update_settings_request_dto::UpdateSettingsRequestDto,
        repositories::settings_repository::SettingsRepositoryError,
    },
};

#[derive(Error, Debug)]
pub enum SettingsUpdaterError {
    #[error(transparent)]
    SettingsRepository(#[from] SettingsRepositoryError),
    #[error(transparent)]
    DatabaseConnectionManager(#[from] DatabaseConnectionManagerError),
    #[error(transparent)]
    SecretsRepository(#[from] SecretsRepositoryError),
}

#[async_trait]
pub trait SettingsUpdater: Send + Sync {
    async fn update_settings(
        &self,
        new_settings: UpdateSettingsRequestDto,
    ) -> Result<(), SettingsUpdaterError>;
}
