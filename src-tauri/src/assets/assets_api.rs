use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::assets::dto::asset_response_dto::AssetResponseDto;
use crate::assets::dto::create_asset_request_dto::CreateAssetRequestDto;
use crate::assets::dto::create_assets_request_dto::CreateAssetsRequestDto;
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

/// Stores many images in one transaction, so a bulk import commits once instead of queuing a
/// write per image. Answers in request order, `None` for an undecodable image.
#[tauri::command]
pub async fn create_assets(
    injector: State<'_, Arc<Injector>>,
    dto: CreateAssetsRequestDto,
) -> Result<Vec<Option<AssetResponseDto>>, ApiError> {
    let scope = injector.start_scope();
    let asset_service = scope.resolve::<dyn AssetService>().await;
    let mut assets = Vec::with_capacity(dto.data_uris.len());
    for data_uri in &dto.data_uris {
        let id = asset_service.create_from_data_uri(data_uri).await?;
        assets.push(id.map(AssetResponseDto::new));
    }
    scope.save_changes().await?;
    Ok(assets)
}
