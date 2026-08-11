use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use chrono::{DateTime, Utc};

use crate::common::api_error::ApiError;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::local_configurations::repositories::local_configuration_repository::{
    LocalConfigurationRepository, LocalConfigurationRepositoryExt,
};
use crate::study::dto::card_due_preview_dto::CardDuePreviewDto;
use crate::study::dto::card_review_dto::CardReviewResponseDto;
use crate::study::dto::due_element_dto::DueElementDto;
use crate::study::dto::learning_asset_review_dto::LearningAssetReviewResponseDto;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::card_grading_service::CardGradingService;
use crate::study::services::due_elements_service::DueElementsService;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
use crate::study::value_objects::fuzz_factor_configuration::{
    FUZZ_FACTOR_CONFIGURATION_NAME, FuzzFactorConfiguration,
};
use crate::study::value_objects::rating::Rating;
use injector::injector::Injector;

#[tauri::command]
pub async fn get_card_review(
    injector: State<'_, Arc<Injector>>,
    card_id: Uuid,
) -> Result<Option<CardReviewResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn CardReviewRepository>()
        .await
        .get_by_card_id(card_id)
        .await?;
    Ok(result.map(|review| review.into()))
}

#[tauri::command]
pub async fn get_learning_asset_review(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<Option<LearningAssetReviewResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LearningAssetReviewRepository>()
        .await
        .get_by_element_id(element_id.id())
        .await?;
    Ok(result.map(|review| review.into()))
}

#[tauri::command]
pub async fn get_due_elements(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<DueElementDto>, ApiError> {
    let scope = injector.start_scope();
    let due_elements = scope
        .resolve::<dyn DueElementsService>()
        .await
        .get_due_elements()
        .await?;
    let meta_repository = scope.resolve::<dyn MetaRepository>().await;

    let mut result = Vec::with_capacity(due_elements.len());
    for element_id in due_elements {
        let meta = meta_repository.get_by_id(element_id.id()).await?;
        result.push(DueElementDto {
            element_id,
            title: meta.name,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn grade_card(
    injector: State<'_, Arc<Injector>>,
    card_id: Uuid,
    rating: Rating,
    duration_ms: Option<u32>,
) -> Result<CardReviewResponseDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn CardGradingService>()
        .await
        .grade_card(card_id, rating, duration_ms)
        .await?;
    scope.save_changes().await?;
    Ok(result.into())
}

#[tauri::command]
pub async fn preview_card_review(
    injector: State<'_, Arc<Injector>>,
    card_id: Uuid,
) -> Result<CardDuePreviewDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn CardGradingService>()
        .await
        .preview_card(card_id)
        .await?;
    Ok(result.into())
}

#[tauri::command]
pub async fn next_learning_asset(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<LearningAssetReviewResponseDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .next(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(result.into())
}

#[tauri::command]
pub async fn preview_next_learning_asset(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<DateTime<Utc>, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .preview_next(element_id)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn finish_learning_asset(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<LearningAssetReviewResponseDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .finish(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(result.into())
}

#[tauri::command]
pub async fn get_fuzz_factor(injector: State<'_, Arc<Injector>>) -> Result<u8, ApiError> {
    let scope = injector.start_scope();
    let configuration = scope
        .resolve::<dyn LocalConfigurationRepository>()
        .await
        .get_by_name::<FuzzFactorConfiguration>(FUZZ_FACTOR_CONFIGURATION_NAME)
        .await?
        .unwrap_or_default();
    Ok(configuration.fuzz_factor)
}

#[tauri::command]
pub async fn set_fuzz_factor(
    injector: State<'_, Arc<Injector>>,
    fuzz_factor: u8,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn LocalConfigurationRepository>()
        .await
        .set_by_name(
            FUZZ_FACTOR_CONFIGURATION_NAME,
            &FuzzFactorConfiguration { fuzz_factor },
        )
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn unfinish_learning_asset(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<LearningAssetReviewResponseDto, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .unfinish(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(result.into())
}

#[tauri::command]
pub async fn finish_learning_assets_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let element_ids = element_ids
        .into_iter()
        .filter(|id| matches!(id, ElementId::LearningAsset(_) | ElementId::Extract(_)))
        .collect();
    scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .finish_many(element_ids)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn reset_repetitions_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();

    let card_ids = element_ids
        .iter()
        .filter_map(|id| match id {
            ElementId::Card(uuid) => Some(*uuid),
            _ => None,
        })
        .collect();
    scope
        .resolve::<dyn CardGradingService>()
        .await
        .reset(card_ids)
        .await?;

    let learning_asset_ids = element_ids
        .into_iter()
        .filter(|id| matches!(id, ElementId::LearningAsset(_) | ElementId::Extract(_)))
        .collect();
    scope
        .resolve::<dyn LearningAssetSchedulingService>()
        .await
        .reset(learning_asset_ids)
        .await?;

    scope.save_changes().await?;
    Ok(())
}
