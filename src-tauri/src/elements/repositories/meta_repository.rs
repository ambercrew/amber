use async_trait::async_trait;
use fractional_index::FractionalIndex;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::tag::Tag;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;

#[async_trait]
pub trait MetaRepository: Send + Sync {
    async fn create_meta(&self, meta: &Meta) -> Result<(), RepositoryError>;

    async fn get_by_id(&self, id: Uuid) -> Result<Meta, RepositoryError>;

    async fn delete(&self, id: ElementId) -> Result<(), RepositoryError>;
    async fn get_tags(&self, id: ElementId) -> Result<Vec<Tag>, RepositoryError>;
    async fn update_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError>;

    /// Adds `tags` to the element's existing tags, ignoring ones already present.
    async fn add_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError>;

    /// Removes `tags` from the element's existing tags, ignoring ones not present.
    async fn remove_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError>;
    async fn rename(&self, id: ElementId, new_name: String) -> Result<(), RepositoryError>;
    async fn exists(&self, id: ElementId) -> Result<bool, RepositoryError>;

    /// Sets or clears (`None`) the element's own study profile. `None` makes
    /// the element inherit from its parent chain.
    async fn set_study_profile(
        &self,
        id: ElementId,
        study_profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError>;

    /// Sets or clears (`None`) the bibliographical source of the element's registry entry.
    async fn set_bibliographical_source(
        &self,
        id: ElementId,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), RepositoryError>;

    /// Number of elements currently pointing at the given bibliographical source.
    async fn count_by_bibliographical_source(
        &self,
        bibliographical_source_id: Uuid,
    ) -> Result<i64, RepositoryError>;

    /// Clears the element's `derived_from` lineage.
    async fn clear_derived_from(&self, id: ElementId) -> Result<(), RepositoryError>;

    /// Changes the parent and position of the given element.
    async fn move_to(
        &self,
        id: ElementId,
        new_parent: Option<ElementId>,
        new_position: FractionalIndex,
    ) -> Result<(), RepositoryError>;

    /// Returns the highest position among all elements with the given parent,
    /// or None if there are no such elements.
    async fn get_last_position(
        &self,
        parent: Option<ElementId>,
    ) -> Result<Option<FractionalIndex>, RepositoryError>;

    /// Return the previous sibling with same parent but less position.
    async fn get_previous_sibling(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError>;

    /// Return the next sibling with same parent but bigger position.
    async fn get_next_sibling(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError>;

    /// Return all elements with the given parent, ordered by position ascending.
    async fn get_children_ordered(
        &self,
        parent: Option<ElementId>,
    ) -> Result<Vec<Meta>, RepositoryError>;

    /// Sets the element's priority (global queue ordering, independent of `position`).
    async fn set_priority(
        &self,
        id: ElementId,
        new_priority: FractionalIndex,
    ) -> Result<(), RepositoryError>;

    /// Lowest priority (i.e. highest-ranked, "front of the queue") across all elements.
    async fn get_first_priority(&self) -> Result<Option<FractionalIndex>, RepositoryError>;

    /// Return the element immediately before this one in global priority order.
    async fn get_previous_by_priority(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError>;

    /// Priority of the live element immediately below (ranked just ahead of)
    /// the given priority value, or `None` if nothing ranks ahead of it.
    async fn get_priority_before(
        &self,
        priority: &FractionalIndex,
    ) -> Result<Option<FractionalIndex>, RepositoryError>;

    /// Priority of the live element immediately above (ranked just behind)
    /// the given priority value, or `None` if nothing ranks behind it.
    async fn get_priority_after(
        &self,
        priority: &FractionalIndex,
    ) -> Result<Option<FractionalIndex>, RepositoryError>;

    /// Whether a live element already has exactly this priority.
    async fn priority_is_taken(&self, priority: &FractionalIndex) -> Result<bool, RepositoryError>;

    /// All elements, ordered by priority ascending (front of queue first).
    async fn get_all_ordered_by_priority(&self) -> Result<Vec<Meta>, RepositoryError>;

    /// The element at the given zero-based offset in priority order,
    /// excluding `excluding`, or `None` if the offset is out of range.
    async fn get_at_priority_offset(
        &self,
        excluding: ElementId,
        offset: i64,
    ) -> Result<Option<Meta>, RepositoryError>;

    /// Total number of elements in the priority queue.
    async fn count_all(&self) -> Result<i64, RepositoryError>;

    /// Number of elements with a strictly lower priority value (i.e. ranked ahead) than this one.
    async fn count_with_lower_priority(&self, id: ElementId) -> Result<i64, RepositoryError>;
}
