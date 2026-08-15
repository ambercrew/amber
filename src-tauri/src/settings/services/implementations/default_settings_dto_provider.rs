use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::{
    ai_integration::services::implementations::default_ai_client_provider::OPENAI_API_KEY_SECRET,
    secrets::repositories::secrets_repository::SecretsRepository,
    settings::{
        dto::settings_dto::SettingsDto, repositories::settings_repository::SettingsRepository,
        services::settings_dto_provider::SettingsDtoProvider,
    },
};

#[derive(ScopeInjectable)]
pub struct DefaultSettingsDtoProvider {
    settings_repository: Arc<dyn SettingsRepository>,
    secrets_repository: Arc<dyn SecretsRepository>,
}

#[async_trait]
impl SettingsDtoProvider for DefaultSettingsDtoProvider {
    async fn get_settings_dto(&self) -> SettingsDto {
        let settings = self.settings_repository.get_settings().await;
        let openai_api_key_is_set = self
            .secrets_repository
            .get_secret(OPENAI_API_KEY_SECRET)
            .await
            .is_some_and(|k| !k.is_empty());

        SettingsDto {
            base_database_directory: settings.base_database_directory_as_string(),
            theme: settings.theme,
            font: settings.font,
            font_headings: settings.font_headings,
            font_monospace: settings.font_monospace,
            zoom_percentage: settings.zoom_percentage,
            auto_sync: settings.auto_sync,
            trash_retention_days: settings.trash_retention_days,
            enable_ai: settings.enable_ai,
            ai_provider: settings.ai_provider,
            ollama: settings.ollama,
            openai: settings.openai,
            openai_api_key_is_set,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::str::FromStr;
    use std::sync::Arc;

    use injector::{injector::Injector, register_scope};
    use tokio::sync::Mutex;

    use crate::{
        infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository,
        settings::{
            entities::settings::Settings, repositories::settings_repository::SettingsRepository,
            services::settings_dto_provider::SettingsDtoProvider,
            value_objects::settings_profile::SettingsProfile,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector(settings: Settings) -> Injector {
        let mut injector = create_test_injector().await;

        injector.register_singleton(Arc::new(Mutex::new(settings)));
        register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
        register_scope!(injector, DefaultSettingsDtoProvider);

        injector
    }

    #[tokio::test]
    pub async fn get_settings_dto_mapped_all_settings_fields_correctly() {
        // Arrange

        let base_dir = PathBuf::from_str("/data/amber").unwrap();
        let settings = Settings::new(base_dir.clone(), SettingsProfile::Default);

        let injector = initialize_test_injector(settings).await;
        let scope = injector.start_scope();
        let service = scope.resolve::<DefaultSettingsDtoProvider>().await;

        // Act

        let actual = service.get_settings_dto().await;

        // Assert

        assert_eq!("/data/amber", actual.base_database_directory);
    }
}
