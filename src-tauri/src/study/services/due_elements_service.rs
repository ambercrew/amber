use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::value_objects::study_scope::StudyScope;

#[async_trait]
pub trait DueElementsService: Send + Sync {
    /// Cards, learning_assets and extracts due on or before the end of the current local day,
    /// narrowed to `scope`'s matches when given.
    async fn get_due_elements(
        &self,
        scope: Option<StudyScope>,
    ) -> Result<Vec<ElementId>, RepositoryError>;
}
