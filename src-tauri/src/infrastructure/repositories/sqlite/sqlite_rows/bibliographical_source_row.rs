use chrono::{DateTime, Utc};
use uuid::fmt::Hyphenated;

use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;

pub struct BibliographicalSourceRow {
    pub id: Hyphenated,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub title: String,
    pub authors: Option<String>,
    pub publication_date: Option<String>,
    pub source_type: String,
    pub location: Option<String>,
}

impl From<BibliographicalSourceRow> for BibliographicalSource {
    fn from(row: BibliographicalSourceRow) -> Self {
        BibliographicalSource {
            id: row.id.into_uuid(),
            created_at: row.created_at,
            modified_at: row.modified_at,
            title: row.title,
            authors: row.authors,
            publication_date: row.publication_date,
            source_type: BibliographicalSourceType::from(row.source_type),
            location: row.location,
        }
    }
}
