use async_trait::async_trait;
#[cfg(test)]
use mockall::automock;
use std::collections::HashMap;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::import::anki::entities::anki_card_link::AnkiCardLink;

/// Which Anki card each imported card came from, and which folders were made from Anki decks. A link
/// outlives its card, so one deleted in Amber isn't imported again.
#[async_trait]
#[cfg_attr(test, automock)]
pub trait AnkiCardLinkRepository: Send + Sync {
    async fn create(&self, link: &AnkiCardLink) -> Result<(), RepositoryError>;

    async fn get_all(&self) -> Result<Vec<AnkiCardLink>, RepositoryError>;

    /// Records the full name of the deck the importer made the folder from.
    async fn set_folder_anki_deck(
        &self,
        folder_id: Uuid,
        deck: &str,
    ) -> Result<(), RepositoryError>;

    /// The deck of each folder the importer made, by folder.
    async fn get_folder_anki_decks(&self) -> Result<HashMap<Uuid, String>, RepositoryError>;
}
