use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::{
    backend::{
        backend_dto::UserInformationDto,
        clients::amber_backend_client::AmberBackendClient,
        dto::sign_up_request_dto::SignUpRequestDto,
        services::authenticator::{Authenticator, AuthenticatorError},
    },
    settings::{
        dto::update_settings_request_dto::UpdateSettingsRequestDto,
        services::settings_updater::SettingsUpdater,
        value_objects::settings_profile::SettingsProfile,
    },
};

#[derive(ScopeInjectable)]
pub struct DefaultAuthenticator {
    backend_client: Arc<dyn AmberBackendClient>,
    settings_updater: Arc<dyn SettingsUpdater>,
}

#[async_trait]
impl Authenticator for DefaultAuthenticator {
    async fn sign_in(
        &self,
        username: String,
        password: String,
    ) -> Result<UserInformationDto, AuthenticatorError> {
        let user_information = self.backend_client.sign_in(username, password).await?;
        self.settings_updater
            .update_settings(UpdateSettingsRequestDto {
                profile: Some(SettingsProfile::User(user_information.username.clone())),
                ..Default::default()
            })
            .await?;
        Ok(user_information)
    }

    async fn sign_in_with_google(
        &self,
        id_token: String,
    ) -> Result<UserInformationDto, AuthenticatorError> {
        let user_information = self.backend_client.sign_in_with_google(id_token).await?;
        self.settings_updater
            .update_settings(UpdateSettingsRequestDto {
                profile: Some(SettingsProfile::User(user_information.username.clone())),
                ..Default::default()
            })
            .await?;
        Ok(user_information)
    }

    async fn sign_out(&self) -> Result<(), AuthenticatorError> {
        self.backend_client.sign_out().await?;
        self.settings_updater
            .update_settings(UpdateSettingsRequestDto {
                profile: Some(SettingsProfile::Default),
                ..Default::default()
            })
            .await?;
        Ok(())
    }

    async fn sign_up(
        &self,
        request: SignUpRequestDto,
    ) -> Result<UserInformationDto, AuthenticatorError> {
        let user_information = self.backend_client.sign_up(request).await?;
        self.settings_updater
            .update_settings(UpdateSettingsRequestDto {
                profile: Some(SettingsProfile::User(user_information.username.clone())),
                ..Default::default()
            })
            .await?;
        Ok(user_information)
    }
}
