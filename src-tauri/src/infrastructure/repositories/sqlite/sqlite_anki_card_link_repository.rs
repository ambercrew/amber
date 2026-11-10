use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::common::repository_error::RepositoryError;
use crate::import::anki::entities::anki_card_link::AnkiCardLink;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::repositories::anki_card_link_repository::AnkiCardLinkRepository;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteAnkiCardLinkRepository {
    tx: Arc<DbTransaction>,
}

struct AnkiCardLinkRow {
    card_id: Hyphenated,
    anki_card_id: i64,
}

#[async_trait]
impl AnkiCardLinkRepository for SqliteAnkiCardLinkRepository {
    async fn create(&self, link: &AnkiCardLink) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            "INSERT OR REPLACE INTO anki_card_links (card_id, anki_card_id) VALUES ($1, $2)",
            link.card_id.hyphenated(),
            link.anki_card_id.0,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_all(&self) -> Result<Vec<AnkiCardLink>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            AnkiCardLinkRow,
            r#"SELECT card_id as "card_id: _", anki_card_id FROM anki_card_links"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| AnkiCardLink {
                card_id: row.card_id.into_uuid(),
                anki_card_id: AnkiCardId(row.anki_card_id),
            })
            .collect())
    }

    async fn set_folder_anki_deck(
        &self,
        folder_id: Uuid,
        deck: &str,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        sqlx::query!(
            "UPDATE folders SET anki_deck = $2 WHERE id = $1",
            folder_id.hyphenated(),
            deck,
        )
        .execute(tx.as_mut())
        .await?;
        Ok(())
    }

    async fn get_folder_anki_decks(&self) -> Result<HashMap<Uuid, String>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let rows = sqlx::query!(
            r#"SELECT id as "id: Hyphenated", anki_deck as "anki_deck!"
            FROM folders WHERE anki_deck IS NOT NULL"#
        )
        .fetch_all(tx.as_mut())
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.id.into_uuid(), row.anki_deck))
            .collect())
    }
}
