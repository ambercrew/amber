use std::sync::Arc;

use tauri::State;

use crate::common::api_error::ApiError;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::trash::dto::trashed_element_dto::TrashedElementResponseDto;
use crate::trash::services::trash_service::TrashService;
use injector::injector::Injector;

#[tauri::command]
pub async fn trash_element(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn TrashService>()
        .await
        .trash_element(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn trash_elements_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn TrashService>()
        .await
        .trash_many(element_ids)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn restore_element(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn TrashService>()
        .await
        .restore_element(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_trash(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<TrashedElementResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let trashed = scope
        .resolve::<dyn TrashService>()
        .await
        .list_trash()
        .await?;
    Ok(trashed
        .into_iter()
        .map(TrashedElementResponseDto::from)
        .collect())
}

#[tauri::command]
pub async fn delete_element_permanently(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn TrashService>()
        .await
        .delete_permanently(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn empty_trash(injector: State<'_, Arc<Injector>>) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn TrashService>()
        .await
        .empty_trash()
        .await?;
    scope.save_changes().await?;
    Ok(())
}
