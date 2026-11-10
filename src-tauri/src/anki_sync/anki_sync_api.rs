use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;
use uuid::Uuid;

use crate::anki_sync::anki_sync_lock::AnkiSyncLock;
use crate::anki_sync::dto::{
    AnkiDeckChoiceDto, AnkiSyncPreviewResponseDto, AnkiSyncResponseDto, AnkiSyncStatusResponseDto,
};
use crate::anki_sync::repositories::anki_sync_repository::AnkiSyncRepository;
use crate::anki_sync::services::anki_sync_service::AnkiSyncService;
use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;

#[tauri::command]
pub async fn get_anki_sync_status(
    injector: State<'_, Arc<Injector>>,
) -> Result<AnkiSyncStatusResponseDto, ApiError> {
    let scope = injector.start_scope();
    let status = scope
        .resolve::<dyn AnkiSyncService>()
        .await
        .status()
        .await?;
    Ok(status.into())
}

#[tauri::command]
pub async fn preview_anki_sync(
    injector: State<'_, Arc<Injector>>,
) -> Result<AnkiSyncPreviewResponseDto, ApiError> {
    let scope = injector.start_scope();
    let preview = scope
        .resolve::<dyn AnkiSyncService>()
        .await
        .preview()
        .await?;
    Ok(preview.into())
}

#[tauri::command]
pub async fn sync_anki(
    injector: State<'_, Arc<Injector>>,
    deck_choices: Vec<AnkiDeckChoiceDto>,
) -> Result<AnkiSyncResponseDto, ApiError> {
    let scope = injector.start_scope();
    let choices = deck_choices.into_iter().map(Into::into).collect();
    let summary = scope
        .resolve::<dyn AnkiSyncService>()
        .await
        .sync(choices)
        .await?;
    scope.save_changes().await?;
    Ok(summary.into())
}

#[tauri::command]
pub async fn cancel_anki_sync(injector: State<'_, Arc<Injector>>) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let lock = scope.resolve::<AnkiSyncLock>().await;
    lock.cancel();
    Ok(())
}

/// Whether the card came from Anki and the sync replaces its content when the note changes there.
#[tauri::command]
pub async fn is_card_synced_from_anki(
    injector: State<'_, Arc<Injector>>,
    card_id: Uuid,
) -> Result<bool, ApiError> {
    let scope = injector.start_scope();
    let synced = scope
        .resolve::<dyn AnkiSyncRepository>()
        .await
        .is_synced_import(card_id)
        .await?;
    Ok(synced)
}
