use async_trait::async_trait;
use serde::Serialize;
use serde::de::DeserializeOwned;
use thiserror::Error;

use crate::{
    common::repository_error::RepositoryError,
    local_configurations::entities::local_configuration::LocalConfiguration,
};

#[async_trait]
pub trait LocalConfigurationRepository: Send + Sync {
    async fn get_by_name_raw(
        &self,
        name: &str,
    ) -> Result<Option<LocalConfiguration>, RepositoryError>;
    async fn upsert(&self, configuration: &LocalConfiguration) -> Result<(), RepositoryError>;
}

#[derive(Debug, Error)]
pub enum LocalConfigurationError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    #[error("Failed to deserialize local configuration value")]
    Deserialize(#[source] serde_json::Error),
    #[error("Failed to serialize local configuration value")]
    Serialize(#[source] serde_json::Error),
}

/// Typed JSON access over [`LocalConfigurationRepository`]'s strings, as a separate blanket trait since
/// generic methods aren't object-safe and that one is resolved as `dyn Trait`.
#[async_trait]
pub trait LocalConfigurationRepositoryExt {
    async fn get_by_name<T: DeserializeOwned + Send>(
        &self,
        name: &str,
    ) -> Result<Option<T>, LocalConfigurationError>;

    async fn set_by_name<T: Serialize + Sync>(
        &self,
        name: &str,
        value: &T,
    ) -> Result<(), LocalConfigurationError>;
}

#[async_trait]
impl<R: LocalConfigurationRepository + ?Sized> LocalConfigurationRepositoryExt for R {
    async fn get_by_name<T: DeserializeOwned + Send>(
        &self,
        name: &str,
    ) -> Result<Option<T>, LocalConfigurationError> {
        self.get_by_name_raw(name)
            .await?
            .map(|configuration| {
                serde_json::from_str(&configuration.value)
                    .map_err(LocalConfigurationError::Deserialize)
            })
            .transpose()
    }

    async fn set_by_name<T: Serialize + Sync>(
        &self,
        name: &str,
        value: &T,
    ) -> Result<(), LocalConfigurationError> {
        let value = serde_json::to_string(value).map_err(LocalConfigurationError::Serialize)?;
        self.upsert(&LocalConfiguration {
            name: name.to_string(),
            value,
        })
        .await?;
        Ok(())
    }
}
