use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use crate::bibliographical_sources::dto::bibliographical_source_dto::{
    BibliographicalSourceRequestDto, BibliographicalSourceResponseDto,
};
use crate::bibliographical_sources::services::bibliographical_source_service::{
    BibliographicalSourceService, BibliographicalSourceWithElementCount,
};
use crate::common::api_error::ApiError;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use injector::injector::Injector;

#[tauri::command]
pub async fn list_bibliographical_sources(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<BibliographicalSourceResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let bibliographical_sources = scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .list_bibliographical_sources()
        .await?;
    Ok(bibliographical_sources
        .into_iter()
        .map(BibliographicalSourceResponseDto::from)
        .collect())
}

#[tauri::command]
pub async fn get_bibliographical_source(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<BibliographicalSourceResponseDto, ApiError> {
    let scope = injector.start_scope();
    let bibliographical_source = scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .get_bibliographical_source(id)
        .await?;
    Ok(bibliographical_source.into())
}

#[tauri::command]
pub async fn create_bibliographical_source(
    injector: State<'_, Arc<Injector>>,
    dto: BibliographicalSourceRequestDto,
) -> Result<BibliographicalSourceResponseDto, ApiError> {
    let scope = injector.start_scope();
    let bibliographical_source = scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .create_or_reuse_bibliographical_source(dto.into())
        .await?;
    scope.save_changes().await?;
    Ok(BibliographicalSourceWithElementCount {
        bibliographical_source,
        element_count: 0,
    }
    .into())
}

#[tauri::command]
pub async fn update_bibliographical_source(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
    dto: BibliographicalSourceRequestDto,
) -> Result<BibliographicalSourceResponseDto, ApiError> {
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn BibliographicalSourceService>().await;
    let bibliographical_source = service
        .update_bibliographical_source(id, dto.into())
        .await?;
    let element_count = service
        .get_bibliographical_source(bibliographical_source.id)
        .await?
        .element_count;
    scope.save_changes().await?;
    Ok(BibliographicalSourceWithElementCount {
        bibliographical_source,
        element_count,
    }
    .into())
}

#[tauri::command]
pub async fn delete_bibliographical_source(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .delete_bibliographical_source(id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn assign_bibliographical_source(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    bibliographical_source_id: Option<Uuid>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .assign_bibliographical_source(element_id, bibliographical_source_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn assign_bibliographical_source_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
    bibliographical_source_id: Option<Uuid>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn BibliographicalSourceService>()
        .await
        .assign_bibliographical_source_many(element_ids, bibliographical_source_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}
