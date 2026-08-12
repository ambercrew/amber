use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::common::api_error::ApiError;
use crate::search::dto::search_element_result_dto::SearchElementResultDto;
use crate::search::dto::search_elements_request_dto::SearchElementsRequestDto;
use crate::search::services::search_service::SearchService;

#[tauri::command]
pub async fn search_elements(
    injector: State<'_, Arc<Injector>>,
    dto: SearchElementsRequestDto,
) -> Result<Vec<SearchElementResultDto>, ApiError> {
    let scope = injector.start_scope();
    let results = scope
        .resolve::<dyn SearchService>()
        .await
        .search_elements(dto.filters)
        .await?;
    Ok(results
        .into_iter()
        .map(SearchElementResultDto::from)
        .collect())
}
