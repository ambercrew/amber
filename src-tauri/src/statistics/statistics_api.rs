use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::common::api_error::ApiError;
use crate::statistics::dto::home_statistics_dto::HomeStatisticsResponseDto;
use crate::statistics::services::statistics_service::StatisticsService;

#[tauri::command]
pub async fn get_home_statistics(
    injector: State<'_, Arc<Injector>>,
) -> Result<HomeStatisticsResponseDto, ApiError> {
    let scope = injector.start_scope();
    let statistics = scope
        .resolve::<dyn StatisticsService>()
        .await
        .get_home_statistics()
        .await?;
    Ok(statistics.into())
}
