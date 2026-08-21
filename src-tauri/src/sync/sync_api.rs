use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::sync::engine::SyncEngine;

#[tauri::command]
pub async fn sync(injector: State<'_, Arc<Injector>>) -> Result<(), ApiError> {
    let scope = injector.start_scope();

    scope.resolve::<dyn SyncEngine>().await.sync().await?;
    scope.save_changes().await?;

    Ok(())
}
