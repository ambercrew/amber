use std::collections::HashMap;

use super::card_row::CardRow;
use super::note::Note;
use super::notetype::Notetype;

/// What an Anki package's collection holds, by id.
pub struct Collection {
    pub notetypes: HashMap<i64, Notetype>,
    pub decks: HashMap<i64, Vec<String>>,
    pub notes: HashMap<i64, Note>,
    pub cards: Vec<CardRow>,
}
