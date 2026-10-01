use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use tokio::{
    fs::{self},
    io::AsyncReadExt,
    sync::Mutex,
};

use crate::{
    infrastructure::value_objects::app_data_directory::AppDataDirectory,
    settings::{
        entities::settings::Settings,
        repositories::settings_repository::{SettingsRepository, SettingsRepositoryError},
    },
};

#[cfg(not(debug_assertions))]
const SETTINGS_FILE_NAME: &str = "settings.json";
#[cfg(debug_assertions)]
const SETTINGS_FILE_NAME: &str = "settings.dev.json";

#[derive(ScopeInjectable)]
pub struct DiskSettingsRepository {
    settings: Arc<Mutex<Settings>>,
    app_data_directory: Arc<AppDataDirectory>,
}

impl DiskSettingsRepository {
    pub async fn get_or_create_settings(
        app_data_directory: &AppDataDirectory,
        settings_if_non_existing: Settings,
    ) -> Result<Settings, SettingsRepositoryError> {
        if app_data_directory
            .get_path()
            .join(SETTINGS_FILE_NAME)
            .exists()
        {
            read_settings_from_file(app_data_directory).await
        } else {
            save_to_disk_inner(&settings_if_non_existing, app_data_directory).await?;
            Ok(settings_if_non_existing)
        }
    }
}

async fn read_settings_from_file(
    app_data_directory: &AppDataDirectory,
) -> Result<Settings, SettingsRepositoryError> {
    use tokio::fs::File;

    let settings_path = app_data_directory.get_path().join(SETTINGS_FILE_NAME);
    log::info!("Reading settings from '{SETTINGS_FILE_NAME}'.");
    let mut file = match File::open(settings_path).await {
        Err(err) => return Err(SettingsRepositoryError::ErrorOpeningFile(Box::new(err))),
        Ok(file) => file,
    };
    let mut file_content = String::new();
    if let Err(err) = file.read_to_string(&mut file_content).await {
        return Err(SettingsRepositoryError::ErrorReadingFile(Box::new(err)));
    }
    match Settings::from_json(&file_content) {
        Ok(settings) => Ok(settings),
        Err(err) => Err(SettingsRepositoryError::Parsing(Box::new(err))),
    }
}

#[async_trait]
impl SettingsRepository for DiskSettingsRepository {
    async fn get_settings(&self) -> Settings {
        self.settings.lock().await.clone()
    }

    async fn save_settings(&self, settings: Settings) -> Result<(), SettingsRepositoryError> {
        let mut current_settings = self.settings.lock().await;
        save_to_disk_inner(&settings, &self.app_data_directory).await?;
        *current_settings = settings;
        Ok(())
    }
}

async fn save_to_disk_inner(
    settings: &Settings,
    app_data_directory: &AppDataDirectory,
) -> Result<(), SettingsRepositoryError> {
    if let Err(err) = fs::create_dir_all(app_data_directory.get_path()).await {
        return Err(SettingsRepositoryError::Saving(Box::new(err)));
    }

    let path = app_data_directory.get_path().join(SETTINGS_FILE_NAME);
    log::info!("Saving settings into '{}'.", path.to_string_lossy());
    match fs::write(path, serde_json::to_string(settings).unwrap()).await {
        Ok(_) => Ok(()),
        Err(err) => Err(SettingsRepositoryError::Saving(Box::new(err))),
    }
}

#[cfg(test)]
pub mod tests {
    use tokio::fs::File;

    use crate::{
        settings::value_objects::{settings_profile::SettingsProfile, theme::Theme},
        test_utils::create_temp_directory,
    };

    use super::*;

    #[tokio::test]
    pub async fn get_or_create_settings_new_settings_created_and_saved_to_disk() {
        // Arrange

        let app_data_directory = AppDataDirectory::new(create_temp_directory().await);
        let default_settings = Settings::new(
            app_data_directory.get_path().clone(),
            SettingsProfile::Default,
        );

        // Act

        DiskSettingsRepository::get_or_create_settings(&app_data_directory, default_settings)
            .await
            .unwrap();

        // Assert

        assert!(
            app_data_directory
                .get_path()
                .join(SETTINGS_FILE_NAME)
                .exists()
        );

        let mut file_content = String::new();
        File::open(app_data_directory.get_path().join(SETTINGS_FILE_NAME))
            .await
            .unwrap()
            .read_to_string(&mut file_content)
            .await
            .unwrap();

        let settings = serde_json::from_str::<Settings>(&file_content).unwrap();
        assert_eq!(
            *settings.database_location().get_path(),
            app_data_directory.get_path().join("amber.dev.db")
        );
        assert_eq!(settings.theme, Theme::FollowSystem);
        assert_eq!(settings.zoom_percentage, 100f64);
        assert!(settings.auto_sync);
    }

    #[tokio::test]
    pub async fn get_or_create_settings_existing_setting_read_from_disk() {
        // Arrange

        let app_data_directory = AppDataDirectory::new(create_temp_directory().await);
        let default_settings = Settings::new(
            app_data_directory.get_path().clone(),
            SettingsProfile::Default,
        );
        let mut settings = DiskSettingsRepository::get_or_create_settings(
            &app_data_directory,
            default_settings.clone(),
        )
        .await
        .unwrap();
        settings.zoom_percentage = 1f64;

        let settings_repository = DiskSettingsRepository {
            app_data_directory: Arc::new(app_data_directory.clone()),
            settings: Arc::new(Mutex::new(settings.clone())),
        };
        settings_repository.save_settings(settings).await.unwrap();

        // Act

        let actual =
            DiskSettingsRepository::get_or_create_settings(&app_data_directory, default_settings)
                .await
                .unwrap();

        // Assert

        assert_eq!(actual.zoom_percentage, 1f64);
    }
}
