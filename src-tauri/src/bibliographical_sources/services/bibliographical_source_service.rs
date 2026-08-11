use async_trait::async_trait;
use thiserror::Error;
use uuid::Uuid;

use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;
use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;

/// Fields owned by the bibliographical source itself and shared by every element descended
/// from it (see `Meta::derived_from` for the per-element lineage field).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibliographicalSourceFields {
    pub title: String,
    pub authors: Option<String>,
    pub publication_date: Option<String>,
    pub source_type: BibliographicalSourceType,
    pub location: Option<String>,
}

/// A registry bibliographical source paired with how many elements point at it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibliographicalSourceWithElementCount {
    pub bibliographical_source: BibliographicalSource,
    pub element_count: i64,
}

#[async_trait]
pub trait BibliographicalSourceService: Send + Sync {
    async fn list_bibliographical_sources(
        &self,
    ) -> Result<Vec<BibliographicalSourceWithElementCount>, RepositoryError>;
    async fn get_bibliographical_source(
        &self,
        id: Uuid,
    ) -> Result<BibliographicalSourceWithElementCount, RepositoryError>;

    /// Creates a new bibliographical source, unless one with the same `location` already
    /// exists, in which case that existing bibliographical source is returned unchanged.
    /// Bibliographical sources without a `location` are never deduplicated.
    async fn create_or_reuse_bibliographical_source(
        &self,
        fields: BibliographicalSourceFields,
    ) -> Result<BibliographicalSource, RepositoryError>;

    /// Edits are global: every element pointing at this bibliographical source sees the
    /// change immediately.
    async fn update_bibliographical_source(
        &self,
        id: Uuid,
        fields: BibliographicalSourceFields,
    ) -> Result<BibliographicalSource, RepositoryError>;

    /// Never deletes elements pointing at the bibliographical source; their `bibliographical_source_id` is
    /// cleared by the database's `ON DELETE SET NULL`.
    async fn delete_bibliographical_source(&self, id: Uuid) -> Result<(), RepositoryError>;

    /// Re-points the element at a different bibliographical source (or clears
    /// it, with `None`) without altering either source's fields.
    async fn assign_bibliographical_source(
        &self,
        element_id: ElementId,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), BibliographicalSourceServiceError>;

    /// Same as `assign_bibliographical_source`, applied to every element in `element_ids`.
    async fn assign_bibliographical_source_many(
        &self,
        element_ids: Vec<ElementId>,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), BibliographicalSourceServiceError>;
}

#[derive(Debug, Error)]
pub enum BibliographicalSourceServiceError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),
}
