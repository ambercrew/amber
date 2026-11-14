use std::sync::Arc;

use injector::injector::Injector;
use tauri::State;

use crate::common::api_error::ApiError;
use crate::search::dto::search_content_request_dto::SearchContentRequestDto;
use crate::search::dto::search_content_response_dto::SearchContentResponseDto;
use crate::search::dto::search_element_result_dto::SearchElementResultDto;
use crate::search::dto::search_elements_request_dto::SearchElementsRequestDto;
use crate::search::latest_content_search::LatestContentSearch;
use crate::search::services::content_search_service::ContentSearchService;
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
        .search_elements(dto.filters, dto.sort, dto.limit)
        .await?;
    Ok(results
        .into_iter()
        .map(SearchElementResultDto::from)
        .collect())
}

#[tauri::command]
/// `None` when a newer search started first, so typing in bursts doesn't queue searches up.
pub async fn search_content(
    injector: State<'_, Arc<Injector>>,
    dto: SearchContentRequestDto,
) -> Result<Option<SearchContentResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let latest = scope.resolve::<LatestContentSearch>().await;
    let search = latest.start();
    let results = scope
        .resolve::<dyn ContentSearchService>()
        .await
        .search_content(&dto.query, dto.case_sensitive, &|| {
            latest.is_superseded(search)
        })
        .await?;
    Ok(results.map(Into::into))
}
