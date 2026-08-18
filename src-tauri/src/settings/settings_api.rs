use std::sync::Arc;

use crate::{
    common::api_error::ApiError,
    settings::{
        dto::{settings_dto::SettingsDto, update_settings_request_dto::UpdateSettingsRequestDto},
        services::{
            settings_dto_provider::SettingsDtoProvider, settings_updater::SettingsUpdater,
            system_fonts_provider::SystemFontsProvider,
        },
    },
    sync::bootstrap::register_sync_tables,
};
use injector::injector::Injector;
use tauri::State;

#[tauri::command]
pub async fn get_settings(injector: State<'_, Arc<Injector>>) -> Result<SettingsDto, ApiError> {
    let scope = injector.start_scope();
    let settings = scope
        .resolve::<dyn SettingsDtoProvider>()
        .await
        .get_settings_dto()
        .await;
    Ok(settings)
}

#[tauri::command]
pub async fn update_settings(
    injector: State<'_, Arc<Injector>>,
    new_settings: UpdateSettingsRequestDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();

    scope
        .resolve::<dyn SettingsUpdater>()
        .await
        .update_settings(new_settings)
        .await?;

    // A base directory or profile change switches the active database (see
    // `DefaultSettingsUpdater::update_settings`), so that database's tables
    // need registering for change tracking again — sync registration
    // doesn't carry over from the previous database.
    register_sync_tables(&injector).await?;

    Ok(())
}

#[tauri::command]
pub async fn list_system_fonts(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<String>, ApiError> {
    let scope = injector.start_scope();
    let fonts = scope
        .resolve::<dyn SystemFontsProvider>()
        .await
        .list_system_fonts()
        .await;
    Ok(fonts)
}
