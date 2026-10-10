use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::assets::dto::asset_response_dto::AssetResponseDto;
use crate::assets::dto::create_asset_request_dto::CreateAssetRequestDto;
use crate::assets::services::asset_service::AssetService;
use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;

#[tauri::command]
pub async fn create_asset(
    injector: State<'_, Arc<Injector>>,
    dto: CreateAssetRequestDto,
) -> Result<AssetResponseDto, ApiError> {
    let scope = injector.start_scope();
    let id = scope
        .resolve::<dyn AssetService>()
        .await
        .create_from_data_uri(&dto.data_uri)
        .await?
        .ok_or_else(|| ApiError::new("The image could not be read.".to_string()))?;
    scope.save_changes().await?;
    Ok(AssetResponseDto::new(id))
}
