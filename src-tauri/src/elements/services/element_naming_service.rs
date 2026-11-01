use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::name_source::NameSource;

/// Keeps `NameSource::Automatic` names in step with their element's content.
#[async_trait]
pub trait ElementNamingService: Send + Sync {
    /// Renames the element after `contents` (see `auto_name`) while its name is `NameSource::Automatic`.
    async fn rename_from_content(
        &self,
        id: ElementId,
        contents: &[&str],
    ) -> Result<(), RepositoryError>;

    /// Switches how the element is named; switching to `Automatic` renames it after its current content.
    async fn set_name_source(
        &self,
        id: ElementId,
        name_source: NameSource,
    ) -> Result<(), RepositoryError>;
}
