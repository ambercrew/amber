use serde::{Deserialize, Serialize};

/// A note's id in an Anki collection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AnkiNoteId(pub i64);
