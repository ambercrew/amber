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
            let new_location = settings.database_location();

            // If nothing lives at the new location yet (e.g. the first time
            // this device signs in as a given user), move the current local
            // database there instead of connecting to a fresh empty one, so
            // local changes made before switching aren't discarded.
            let database_already_exists = tokio::fs::try_exists(new_location.get_path())
                .await
                .unwrap_or(false);

            if database_already_exists {
                log::info!("Changing database location to {new_location}");
                self.database_connection_manager
                    .connect_to_database(new_location)
                    .await?;
            } else {
                log::info!("Moving database to {new_location}");
                self.database_connection_manager
                    .move_database_to(new_location)
                    .await?;
            }
        }

        self.settings_repository.save_settings(settings).await?;

        if let Some(api_key) = &openai_api_key_to_save {
            self.secrets_repository
                .set_secret(OPENAI_API_KEY_SECRET, api_key)
                .await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
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
    pub async fn update_settings_updated_database_location_to_missing_database_moved_database() {
        // Arrange

        let base_dir = std::env::temp_dir().join("amber_test_update_settings_missing_database");
        std::fs::remove_dir_all(&base_dir).ok();

        let request = UpdateSettingsRequestDto {
            base_database_directory: Some(base_dir.clone()),
            ..Default::default()
        };

        let mut database_connection_manager = MockDatabaseConnectionManager::new();
        database_connection_manager
            .expect_move_database_to()
            .with(eq(DatabaseLocation::new_unchecked(
                base_dir.join("amber.dev.db"),
            )))
            .returning(|_| Box::pin(async { Ok(()) }));
        database_connection_manager
            .expect_connect_to_database()
            .never();

        let injector = initialize_test_injector(database_connection_manager).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act & Assert

        service.update_settings(request).await.unwrap();

        std::fs::remove_dir_all(&base_dir).ok();
    }

    #[tokio::test]
    pub async fn update_settings_updated_database_location_to_existing_database_connected_to_database()
     {
        // Arrange

        let base_dir = std::env::temp_dir().join("amber_test_update_settings_existing_database");
        std::fs::remove_dir_all(&base_dir).ok();
        std::fs::create_dir_all(&base_dir).unwrap();
        std::fs::write(base_dir.join("amber.dev.db"), b"").unwrap();

        let request = UpdateSettingsRequestDto {
            base_database_directory: Some(base_dir.clone()),
            ..Default::default()
        };

        let mut database_connection_manager = MockDatabaseConnectionManager::new();
        database_connection_manager
            .expect_connect_to_database()
            .with(eq(DatabaseLocation::new_unchecked(
                base_dir.join("amber.dev.db"),
            )))
            .returning(|_| Box::pin(async { Ok(()) }));
        database_connection_manager
            .expect_move_database_to()
            .never();

        let injector = initialize_test_injector(database_connection_manager).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsUpdater>().await;

        // Act & Assert

        service.update_settings(request).await.unwrap();

        std::fs::remove_dir_all(&base_dir).ok();
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
