use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;

/// An original work (book, article, paper, video) elements were imported from, stored once and shared
/// through `Meta::bibliographical_source_id`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibliographicalSource {
    pub id: Uuid,
    pub title: String,
    pub authors: Option<String>,
    /// Free-form text rather than a date type: real sources have partial dates
    /// ("1789", "March 2024", "n.d.").
    pub publication_date: Option<String>,
    pub source_type: BibliographicalSourceType,
    /// URL or file name.
    pub location: Option<String>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}
