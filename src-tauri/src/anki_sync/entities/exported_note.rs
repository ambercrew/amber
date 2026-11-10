use crate::anki_sync::notes::EXPORT_VERSION;

/// What a note last sent to an Anki profile held.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedNote {
    pub guid: String,
    /// A hash of everything Anki's importer updates: fields, tags and cards, before rendering.
    pub fingerprint: String,
    /// The `EXPORT_VERSION` it was rendered with, apart from the fingerprint so a new one isn't an edit.
    pub version: i64,
    /// Kept apart because Anki's importer never moves an existing card to another deck.
    pub deck: String,
    /// The modification time it was sent with, in Unix seconds.
    pub modified: i64,
}

impl ExportedNote {
    /// Whether Anki holds a note with this fingerprint as this version of Amber renders it.
    pub fn holds(&self, fingerprint: &str) -> bool {
        self.fingerprint == fingerprint && self.version == EXPORT_VERSION
    }
}
