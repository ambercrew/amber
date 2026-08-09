use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;
use uuid::Uuid;

use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::saved_searches::dto::saved_search_create_request_dto::SavedSearchCreateRequestDto;
use crate::saved_searches::dto::saved_search_filter_dto::SavedSearchFilterDto;
use crate::saved_searches::dto::saved_search_rename_request_dto::SavedSearchRenameRequestDto;
use crate::saved_searches::dto::saved_search_response_dto::SavedSearchResponseDto;
use crate::saved_searches::dto::saved_search_update_filters_request_dto::SavedSearchUpdateFiltersRequestDto;
use crate::saved_searches::services::saved_search_service::SavedSearchService;

#[tauri::command]
pub async fn list_saved_searches(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<SavedSearchResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let saved_searches = scope
        .resolve::<dyn SavedSearchService>()
        .await
        .list_saved_searches()
        .await?;
    Ok(saved_searches
        .into_iter()
        .map(SavedSearchResponseDto::from)
        .collect())
}

#[tauri::command]
pub async fn get_saved_search_filters(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<Vec<SavedSearchFilterDto>, ApiError> {
    let scope = injector.start_scope();
    let filters = scope
        .resolve::<dyn SavedSearchService>()
        .await
        .get_saved_search_filters(id)
        .await?;
    Ok(filters
        .into_iter()
        .map(SavedSearchFilterDto::from)
        .collect())
}

#[tauri::command]
pub async fn create_saved_search(
    injector: State<'_, Arc<Injector>>,
    dto: SavedSearchCreateRequestDto,
) -> Result<SavedSearchResponseDto, ApiError> {
    let scope = injector.start_scope();
    let filters = dto.filters.into_iter().map(Into::into).collect();
    let saved_search = scope
        .resolve::<dyn SavedSearchService>()
        .await
        .create_saved_search(dto.name, filters)
        .await?;
    scope.save_changes().await?;
    Ok(saved_search.into())
}

#[tauri::command]
pub async fn rename_saved_search(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
    dto: SavedSearchRenameRequestDto,
) -> Result<SavedSearchResponseDto, ApiError> {
    let scope = injector.start_scope();
    let saved_search = scope
        .resolve::<dyn SavedSearchService>()
        .await
        .rename_saved_search(id, dto.name)
        .await?;
    scope.save_changes().await?;
    Ok(saved_search.into())
}

#[tauri::command]
pub async fn update_saved_search_filters(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
    dto: SavedSearchUpdateFiltersRequestDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let filters = dto.filters.into_iter().map(Into::into).collect();
    scope
        .resolve::<dyn SavedSearchService>()
        .await
        .update_saved_search_filters(id, filters)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn duplicate_saved_search(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<SavedSearchResponseDto, ApiError> {
    let scope = injector.start_scope();
    let saved_search = scope
        .resolve::<dyn SavedSearchService>()
        .await
        .duplicate_saved_search(id)
        .await?;
    scope.save_changes().await?;
    Ok(saved_search.into())
}

#[tauri::command]
pub async fn delete_saved_search(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn SavedSearchService>()
        .await
        .delete_saved_search(id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}
