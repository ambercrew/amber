use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::dto::SyncResponseDto;
use crate::sync::engine::SyncEngine;
use crate::sync::sync_completion::SyncCompletion;

#[tauri::command]
pub async fn sync(injector: State<'_, Arc<Injector>>) -> Result<SyncResponseDto, ApiError> {
    let scope = injector.start_scope();

    let result: Result<SyncResponseDto, ApiError> = async {
        let outcome = scope.resolve::<dyn SyncEngine>().await.sync().await?;
        scope.save_changes().await?;
        Ok(outcome.into())
    }
    .await;

    let completion = scope.resolve::<SyncCompletion>().await;
    match result {
        Ok(_) => completion.mark_completed(),
        Err(_) => completion.mark_attempted(),
    }

    result
}
