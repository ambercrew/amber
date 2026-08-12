use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::search::entities::element_search_result::ElementSearchResult;
use crate::search::repositories::search_repository::SearchRepository;
use crate::search::services::search_service::SearchService;

#[derive(ScopeInjectable)]
pub struct DefaultSearchService {
    search_repository: Arc<dyn SearchRepository>,
}

#[async_trait]
impl SearchService for DefaultSearchService {
    async fn search_elements(
        &self,
        filters: Vec<ElementFilter>,
    ) -> Result<Vec<ElementSearchResult>, RepositoryError> {
        self.search_repository.search(&filters).await
    }
}
