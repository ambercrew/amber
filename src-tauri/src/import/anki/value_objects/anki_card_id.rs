use serde::{Deserialize, Serialize};

/// A card's id in an Anki collection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AnkiCardId(pub i64);
