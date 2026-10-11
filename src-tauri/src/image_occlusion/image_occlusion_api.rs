use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;
use uuid::Uuid;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::api_error::ApiError;
use crate::image_occlusion::dto::create_image_occlusion_dto::CreateImageOcclusionDto;
use crate::image_occlusion::dto::image_occlusion_lookup_dto::ImageOcclusionLookupDto;
use crate::image_occlusion::dto::image_occlusion_response_dto::ImageOcclusionResponseDto;
use crate::image_occlusion::dto::update_image_occlusion_dto::UpdateImageOcclusionDto;
use crate::image_occlusion::services::image_occlusion_service::ImageOcclusionService;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;

#[tauri::command]
pub async fn get_image_occlusion(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<ImageOcclusionLookupDto, ApiError> {
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn ImageOcclusionService>().await;
    Ok(match service.find(id).await? {
        Some(occlusion) => ImageOcclusionLookupDto::Found {
            occlusion: occlusion.into(),
        },
        None if service.was_deleted(id).await? => ImageOcclusionLookupDto::Deleted,
        None => ImageOcclusionLookupDto::NotSynced,
    })
}

#[tauri::command]
pub async fn find_image_occlusion_by_source(
    injector: State<'_, Arc<Injector>>,
    parent_id: Uuid,
    image_asset_id: AssetId,
) -> Result<Option<ImageOcclusionResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let occlusion = scope
        .resolve::<dyn ImageOcclusionService>()
        .await
        .find_by_source(parent_id, image_asset_id)
        .await?;
    Ok(occlusion.map(Into::into))
}

#[tauri::command]
pub async fn create_image_occlusion(
    injector: State<'_, Arc<Injector>>,
    dto: CreateImageOcclusionDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ImageOcclusionService>()
        .await
        .create(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_image_occlusion(
    injector: State<'_, Arc<Injector>>,
    dto: UpdateImageOcclusionDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ImageOcclusionService>()
        .await
        .update(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}
