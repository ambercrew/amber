use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use crate::common::api_error::ApiError;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::study::dto::study_profile_dto::{
    EffectiveProfileResponseDto, StudyProfileRequestDto, StudyProfileResponseDto,
};
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::services::study_profile_service::StudyProfileService;
use injector::injector::Injector;

#[tauri::command]
pub async fn list_study_profiles(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<StudyProfileResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let profiles = scope
        .resolve::<dyn StudyProfileService>()
        .await
        .list_profiles()
        .await?;
    Ok(profiles.into_iter().map(|profile| profile.into()).collect())
}

#[tauri::command]
pub async fn create_study_profile(
    injector: State<'_, Arc<Injector>>,
    dto: StudyProfileRequestDto,
) -> Result<StudyProfileResponseDto, ApiError> {
    let scope = injector.start_scope();
    let profile = scope
        .resolve::<dyn StudyProfileService>()
        .await
        .create_profile(dto.into())
        .await?;
    scope.save_changes().await?;
    Ok(profile.into())
}

#[tauri::command]
pub async fn update_study_profile(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
    dto: StudyProfileRequestDto,
) -> Result<StudyProfileResponseDto, ApiError> {
    let scope = injector.start_scope();
    let profile = scope
        .resolve::<dyn StudyProfileService>()
        .await
        .update_profile(id, dto.into())
        .await?;
    scope.save_changes().await?;
    Ok(profile.into())
}

#[tauri::command]
pub async fn delete_study_profile(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn StudyProfileService>()
        .await
        .delete_profile(id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn clone_study_profile(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<StudyProfileResponseDto, ApiError> {
    let scope = injector.start_scope();
    let profile = scope
        .resolve::<dyn StudyProfileService>()
        .await
        .clone_profile(id)
        .await?;
    scope.save_changes().await?;
    Ok(profile.into())
}

#[tauri::command]
pub async fn set_default_study_profile(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<StudyProfileResponseDto, ApiError> {
    let scope = injector.start_scope();
    let profile = scope
        .resolve::<dyn StudyProfileService>()
        .await
        .set_default_profile(id)
        .await?;
    scope.save_changes().await?;
    Ok(profile.into())
}

#[tauri::command]
pub async fn assign_study_profile(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    profile_id: Option<Uuid>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn StudyProfileService>()
        .await
        .assign_profile(element_id, profile_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn assign_study_profile_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
    profile_id: Option<Uuid>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn StudyProfileService>()
        .await
        .assign_profile_many(element_ids, profile_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_effective_study_profile(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<EffectiveProfileResponseDto, ApiError> {
    let scope = injector.start_scope();
    let effective = scope
        .resolve::<dyn ProfileResolutionService>()
        .await
        .resolve_effective_profile(element_id)
        .await?;
    Ok(effective.into())
}
