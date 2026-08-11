use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use crate::common::api_error::ApiError;
use crate::elements::dto::any_element_dto::AnyElementDto;
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_extract_dto::CreateExtractDto;
use crate::elements::dto::create_folder_dto::CreateFolderDto;
use crate::elements::dto::create_learning_asset_dto::CreateLearningAssetDto;
use crate::elements::dto::element_details_dto::ElementDetailsResponseDto;
use crate::elements::dto::learning_asset_split_id_dto::LearningAssetSplitIdDto;
use crate::elements::dto::learning_asset_split_meta_dto::LearningAssetSplitMetaDto;
use crate::elements::dto::learning_asset_split_text_dto::LearningAssetSplitTextDto;
use crate::elements::dto::move_element_dto::MoveElementRequestDto;
use crate::elements::dto::tag_dto::TagResponseDto;
use crate::elements::dto::tree_dto::NodeDto;
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::elements::dto::update_extract_dto::UpdateExtractDto;
use crate::elements::dto::update_learning_asset_dto::UpdateLearningAssetDto;
use crate::elements::dto::update_read_point_dto::UpdateReadPointDto;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::folder_repository::FolderRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::services::element_details_service::ElementDetailsService;
use crate::elements::services::element_move_service::ElementMoveService;
use crate::elements::services::element_tree_service::ElementTreeService;
use crate::elements::services::priority_service::PriorityService;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use injector::injector::Injector;

#[tauri::command]
pub async fn get_element_tree(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<NodeDto>, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn ElementTreeService>()
        .await
        .get_element_tree()
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn rename_element(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    new_name: String,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn MetaRepository>()
        .await
        .rename(element_id, new_name)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_folder(
    injector: State<'_, Arc<Injector>>,
    dto: CreateFolderDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_folder(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_learning_asset(
    injector: State<'_, Arc<Injector>>,
    dto: CreateLearningAssetDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_learning_asset(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_extract(
    injector: State<'_, Arc<Injector>>,
    dto: CreateExtractDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_extract(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn element_exists(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<bool, ApiError> {
    let scope = injector.start_scope();
    let result = scope
        .resolve::<dyn MetaRepository>()
        .await
        .exists(element_id)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn create_card(
    injector: State<'_, Arc<Injector>>,
    dto: CreateCardDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ElementCreationService>()
        .await
        .create_card(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_learning_asset(
    injector: State<'_, Arc<Injector>>,
    dto: UpdateLearningAssetDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn LearningAssetRepository>()
        .await
        .update_content(dto.split_id.into(), dto.content)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_learning_asset_split_manifest(
    injector: State<'_, Arc<Injector>>,
    learning_asset_id: Uuid,
) -> Result<Vec<LearningAssetSplitMetaDto>, ApiError> {
    let scope = injector.start_scope();
    let manifest = scope
        .resolve::<dyn LearningAssetRepository>()
        .await
        .get_split_manifest(learning_asset_id)
        .await?;
    Ok(manifest
        .into_iter()
        .map(LearningAssetSplitMetaDto::from)
        .collect())
}

#[tauri::command]
pub async fn get_learning_asset_split_texts(
    injector: State<'_, Arc<Injector>>,
    learning_asset_id: Uuid,
) -> Result<Vec<LearningAssetSplitTextDto>, ApiError> {
    let scope = injector.start_scope();
    let texts = scope
        .resolve::<dyn LearningAssetRepository>()
        .await
        .get_split_texts(learning_asset_id)
        .await?;
    Ok(texts
        .into_iter()
        .map(LearningAssetSplitTextDto::from)
        .collect())
}

#[tauri::command]
pub async fn get_learning_asset_split_content(
    injector: State<'_, Arc<Injector>>,
    dto: LearningAssetSplitIdDto,
) -> Result<String, ApiError> {
    let scope = injector.start_scope();
    let content = scope
        .resolve::<dyn LearningAssetRepository>()
        .await
        .get_split_content(dto.into())
        .await?;
    Ok(content)
}

#[tauri::command]
pub async fn update_read_point(
    injector: State<'_, Arc<Injector>>,
    dto: UpdateReadPointDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn LearningAssetRepository>()
        .await
        .update_read_point(dto.learning_asset_id, dto.read_point)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_extract(
    injector: State<'_, Arc<Injector>>,
    dto: UpdateExtractDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ExtractRepository>()
        .await
        .update_content(dto.id, dto.content)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_interval_multiplier(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    interval_multiplier: f32,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    match element_id {
        ElementId::LearningAsset(id) => {
            scope
                .resolve::<dyn LearningAssetRepository>()
                .await
                .update_interval_multiplier(id, interval_multiplier)
                .await?;
        }
        ElementId::Extract(id) => {
            scope
                .resolve::<dyn ExtractRepository>()
                .await
                .update_interval_multiplier(id, interval_multiplier)
                .await?;
        }
        _ => {
            return Err(ApiError::new(
                "interval_multiplier is only valid for learning_assets and extracts".to_string(),
            ));
        }
    }
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_card(
    injector: State<'_, Arc<Injector>>,
    dto: UpdateCardDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn CardRepository>()
        .await
        .update_content(dto.id, dto.front, dto.back)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_element_tags(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    tags: Vec<String>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn MetaRepository>()
        .await
        .update_tags(element_id, tags)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn add_tag_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
    tags: Vec<String>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let meta_repository = scope.resolve::<dyn MetaRepository>().await;
    for element_id in element_ids {
        meta_repository.add_tags(element_id, tags.clone()).await?;
    }
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_tag_bulk(
    injector: State<'_, Arc<Injector>>,
    element_ids: Vec<ElementId>,
    tags: Vec<String>,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let meta_repository = scope.resolve::<dyn MetaRepository>().await;
    for element_id in element_ids {
        meta_repository
            .remove_tags(element_id, tags.clone())
            .await?;
    }
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn clear_derived_from(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn MetaRepository>()
        .await
        .clear_derived_from(element_id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn move_element(
    injector: State<'_, Arc<Injector>>,
    dto: MoveElementRequestDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn ElementMoveService>()
        .await
        .move_element(dto)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_element_by_id(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<AnyElementDto, ApiError> {
    let scope = injector.start_scope();
    let mut dto: AnyElementDto = match element_id {
        ElementId::Folder(_) => scope
            .resolve::<dyn FolderRepository>()
            .await
            .get_by_id(element_id.id())
            .await?
            .into(),
        ElementId::LearningAsset(_) => scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .get_by_id(element_id.id())
            .await?
            .into(),
        ElementId::Extract(_) => scope
            .resolve::<dyn ExtractRepository>()
            .await
            .get_by_id(element_id.id())
            .await?
            .into(),
        ElementId::Card(_) => scope
            .resolve::<dyn CardRepository>()
            .await
            .get_by_id(element_id.id())
            .await?
            .into(),
    };

    let tags = scope
        .resolve::<dyn MetaRepository>()
        .await
        .get_tags(element_id)
        .await?
        .into_iter()
        .map(TagResponseDto::from)
        .collect();

    dto.meta_mut().tags = tags;

    Ok(dto)
}

#[tauri::command]
pub async fn get_element_details(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
) -> Result<ElementDetailsResponseDto, ApiError> {
    let scope = injector.start_scope();
    let details = scope
        .resolve::<dyn ElementDetailsService>()
        .await
        .get_element_details(element_id)
        .await?;
    Ok(details.into())
}

#[tauri::command]
pub async fn set_element_priority_by_rank(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    rank: i64,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn PriorityService>()
        .await
        .set_priority_by_rank(element_id, rank)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn set_element_priority_by_percentage(
    injector: State<'_, Arc<Injector>>,
    element_id: ElementId,
    percentage: f64,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn PriorityService>()
        .await
        .set_priority_by_percentage(element_id, percentage)
        .await?;
    scope.save_changes().await?;
    Ok(())
}
