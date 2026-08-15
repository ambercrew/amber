use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::{
    ai_integration::services::implementations::default_ai_client_provider::OPENAI_API_KEY_SECRET,
    database::database_connection_manager::DatabaseConnectionManager,
    secrets::repositories::secrets_repository::SecretsRepository,
    settings::{
        dto::update_settings_request_dto::UpdateSettingsRequestDto,
        repositories::settings_repository::SettingsRepository,
        services::settings_updater::{SettingsUpdater, SettingsUpdaterError},
        value_objects::settings_profile::SettingsProfile,
    },
};

#[derive(ScopeInjectable)]
pub struct DefaultSettingsUpdater {
    settings_repository: Arc<dyn SettingsRepository>,
    database_connection_manager: Arc<dyn DatabaseConnectionManager>,
    secrets_repository: Arc<dyn SecretsRepository>,
}

#[async_trait]
impl SettingsUpdater for DefaultSettingsUpdater {
    async fn update_settings(
        &self,
        new_settings: UpdateSettingsRequestDto,
    ) -> Result<(), SettingsUpdaterError> {
        let mut settings = self.settings_repository.get_settings().await;
        let mut change_database_location = false;

        if let Some(new_base_dir) = new_settings.base_database_directory
            && new_base_dir != settings.base_database_directory
        {
            settings.base_database_directory = new_base_dir;
            change_database_location = true;
        }
        if let Some(new_profile) = new_settings.profile
            && new_profile != settings.profile
        {
            settings.profile = new_profile;
            change_database_location = true;
        }
        if let Some(theme) = new_settings.theme {
            settings.theme = theme;
        }
        if let Some(font) = new_settings.font {
            settings.font = font;
        }
        if let Some(font_headings) = new_settings.font_headings {
            settings.font_headings = font_headings;
        }
        if let Some(font_monospace) = new_settings.font_monospace {
            settings.font_monospace = font_monospace;
        }
        if let Some(zoom_percentage) = new_settings.zoom_percentage {
            settings.zoom_percentage = zoom_percentage;
        }
        if let Some(auto_sync) = new_settings.auto_sync {
            settings.auto_sync = auto_sync;
        }
        if let Some(trash_retention_days) = new_settings.trash_retention_days {
            settings.trash_retention_days = trash_retention_days;
        }
        if let Some(enable_ai) = new_settings.enable_ai {
            settings.enable_ai = enable_ai;
        }
        if let Some(ai_provider) = new_settings.ai_provider {
            settings.ai_provider = ai_provider;
        }
        if let Some(mut ollama) = new_settings.ollama {
            // Ollama has no API key concept today; drop whatever was sent
            // rather than persisting it in plain-text settings.
            ollama.api_key = None;
            settings.ollama = ollama;
        }

        let mut openai_api_key_to_save = None;
        if let Some(mut openai) = new_settings.openai {
            // The key is a secret, so it's pulled out here and saved via
            // `SecretsRepository` below instead of being persisted as part
            // of the plain-text settings file.
            openai_api_key_to_save = openai.api_key.take();
            settings.openai = openai;
        }

        if change_database_location {
            log::info!(
                "Changing database location to {}",
                settings.database_location()
            );
            self.database_connection_manager
                .connect_to_database(settings.database_location())
                .await?;
        }

        self.settings_repository.save_settings(settings).await?;

        if let Some(api_key) = &openai_api_key_to_save {
            self.secrets_repository
                .set_secret(OPENAI_API_KEY_SECRET, api_key)
                .await?;
        }

        Ok(())
    }

    /// Sets the profile for settings when the user is newly created, leading to
    /// database being moved to the new user location.
    async fn set_profile_for_new_user(
        &self,
        profile_name: String,
    ) -> Result<(), SettingsUpdaterError> {
        let mut settings = self.settings_repository.get_settings().await;
        settings.profile = SettingsProfile::User(profile_name);
        self.database_connection_manager
            .move_database_to(settings.database_location())
            .await?;
        self.settings_repository.save_settings(settings).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, str::FromStr};

    use injector::{injector::Injector, register_scope};
    use mockall::predicate::eq;
    use tokio::sync::Mutex;

    use crate::{
        database::database_connection_manager::MockDatabaseConnectionManager,
        infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository,
        settings::{
            dto::update_settings_request_dto::UpdateSettingsRequestDto,
            entities::settings::Settings,
            services::settings_updater::SettingsUpdater,
            value_objects::{
                ai_provider_settings::AiProviderSettings, database_location::DatabaseLocation,
            },
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector(
        database_connection_manager: MockDatabaseConnectionManager,
    ) -> Injector {
        let mut injector = create_test_injector().await;

        let settings = Settings {
            ..Default::default()
        };

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        injector.register_singleton::<dyn DatabaseConnectionManager>(Arc::new(
            database_connection_manager,
        ));

        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, DefaultSettingsUpdater);

        injector
    }

    #[tokio::test]
    pub async fn update_settings_updated_database_location_called_manager() {
        // Arrange

        let request = UpdateSettingsRequestDto {
            base_database_directory: Some("new path".into()),
            ..Default::default()
        };

        let mut database_connection_manager = MockDatabaseConnectionManager::new();
        database_connection_manager
            .expect_connect_to_database()
            .with(eq(DatabaseLocation::new_unchecked(
                PathBuf::from_str("new path").unwrap().join("amber.dev.db"),
            )))
            .returning(|_| Box::pin(async { Ok(()) }));

        let injector = initialize_test_injector(database_connection_manager).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act & Assert

        service.update_settings(request).await.unwrap();
    }

    #[tokio::test]
    pub async fn update_settings_did_not_update_database_location_did_not_call_manager() {
        // Arrange

        let request = UpdateSettingsRequestDto {
            ..Default::default()
        };

        let mut database_connection_manager = MockDatabaseConnectionManager::new();
        database_connection_manager
            .expect_connect_to_database()
            .never();

        let injector = initialize_test_injector(database_connection_manager).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act & Assert

        service.update_settings(request).await.unwrap();
    }

    #[tokio::test]
    pub async fn update_settings_openai_api_key_provided_saved_secret_and_not_persisted_in_settings()
     {
        // Arrange

        let request = UpdateSettingsRequestDto {
            openai: Some(AiProviderSettings {
                model_name: Some("gpt-4o".to_string()),
                api_key: Some("sk-test-key".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let injector = initialize_test_injector(MockDatabaseConnectionManager::new()).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act

        service.update_settings(request).await.unwrap();

        // Assert

        let secret = scope
            .resolve::<dyn SecretsRepository>()
            .await
            .get_secret(OPENAI_API_KEY_SECRET)
            .await;
        assert_eq!(Some("sk-test-key".to_string()), secret);

        let settings = scope.resolve::<dyn SettingsRepository>().await;
        let saved = settings.get_settings().await;
        assert_eq!(Some("gpt-4o".to_string()), saved.openai.model_name);
        assert_eq!(None, saved.openai.api_key);
    }

    #[tokio::test]
    pub async fn update_settings_openai_api_key_not_provided_did_not_save_secret() {
        // Arrange

        let request = UpdateSettingsRequestDto {
            openai: Some(AiProviderSettings {
                model_name: Some("gpt-4o".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let injector = initialize_test_injector(MockDatabaseConnectionManager::new()).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act

        service.update_settings(request).await.unwrap();

        // Assert

        let secret = scope
            .resolve::<dyn SecretsRepository>()
            .await
            .get_secret(OPENAI_API_KEY_SECRET)
            .await;
        assert_eq!(None, secret);
    }
}
