use std::sync::Arc;

use crate::{
    backend::{
        clients::amber_backend_client::AmberBackendClient, dto::backend_dto::UserInformationDto,
    },
    common::api_error::ApiError,
};
use injector::injector::Injector;
use tauri::State;

#[tauri::command]
pub async fn get_user_information(
    injector: State<'_, Arc<Injector>>,
) -> Result<UserInformationDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn AmberBackendClient>()
        .await
        .get_user_information()
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn update_user_information(
    injector: State<'_, Arc<Injector>>,
    first_name: Option<String>,
    last_name: Option<String>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn AmberBackendClient>()
        .await
        .update_user_information(first_name, last_name)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_user(injector: State<'_, Arc<Injector>>) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn AmberBackendClient>()
        .await
        .delete_user()
        .await?;
    Ok(())
}
