use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::anki_sync::entities::anki_card_pair::AnkiCardPair;
use crate::anki_sync::entities::exported_note::ExportedNote;
use crate::anki_sync::entities::synced_schedule::SyncedSchedule;
use crate::anki_sync::repositories::anki_sync_repository::AnkiSyncRepository;
use crate::common::repository_error::RepositoryError;
use crate::import::anki::value_objects::anki_card_id::AnkiCardId;
use crate::import::anki::value_objects::anki_note_id::AnkiNoteId;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteAnkiSyncRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl AnkiSyncRepository for SqliteAnkiSyncRepository {
    async fn get_exported_notes(
        &self,
        profile: &str,
    ) -> Result<Vec<ExportedNote>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let notes = sqlx::query_as!(
            ExportedNote,
            "SELECT guid, fingerprint, version, deck, modified FROM anki_exported_notes WHERE profile = $1",
            profile
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(notes)
    }

    async fn save_exported_note(
        &self,
        profile: &str,
        note: &ExportedNote,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT OR REPLACE INTO anki_exported_notes
            (profile, guid, fingerprint, version, deck, modified) VALUES ($1, $2, $3, $4, $5, $6)"#,
            profile,
            note.guid,
            note.fingerprint,
            note.version,
            note.deck,
            note.modified,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn delete_exported_note(&self, profile: &str, guid: &str) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            "DELETE FROM anki_exported_notes WHERE profile = $1 AND guid = $2",
            profile,
            guid,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_last_synced(
        &self,
        profile: &str,
    ) -> Result<Option<DateTime<Utc>>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let seconds = sqlx::query_scalar!(
            "SELECT last_synced_at FROM anki_profiles WHERE profile = $1",
            profile
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(seconds.and_then(|seconds| DateTime::from_timestamp(seconds, 0)))
    }

    async fn set_last_synced(
        &self,
        profile: &str,
        synced_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let seconds = synced_at.timestamp();

        sqlx::query!(
            "INSERT OR REPLACE INTO anki_profiles (profile, last_synced_at) VALUES ($1, $2)",
            profile,
            seconds,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_deck_choices(
        &self,
        profile: &str,
    ) -> Result<HashMap<String, bool>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT deck, import as "import: bool" FROM anki_deck_choices WHERE profile = $1"#,
            profile
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(|row| (row.deck, row.import)).collect())
    }

    async fn save_deck_choice(
        &self,
        profile: &str,
        deck: &str,
        import: bool,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            "INSERT OR REPLACE INTO anki_deck_choices (profile, deck, import) VALUES ($1, $2, $3)",
            profile,
            deck,
            import,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_paired_cards(&self, profile: &str) -> Result<Vec<AnkiCardPair>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT anki_card_id, card_id as "card_id: Hyphenated"
            FROM anki_paired_cards WHERE profile = $1"#,
            profile
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| AnkiCardPair {
                card_id: row.card_id.into_uuid(),
                anki_card_id: AnkiCardId(row.anki_card_id),
            })
            .collect())
    }

    async fn is_synced_import(&self, card_id: Uuid) -> Result<bool, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query!(
            r#"SELECT EXISTS(
                SELECT 1 FROM anki_card_links l
                WHERE l.card_id = $1
                  AND (l.synced = 1 OR EXISTS(
                    SELECT 1 FROM anki_paired_cards p
                    WHERE p.card_id = l.card_id AND p.anki_card_id = l.anki_card_id))
            ) as "synced: bool""#,
            card_id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.synced)
    }

    async fn get_synced_schedules(
        &self,
        profile: &str,
    ) -> Result<HashMap<AnkiCardId, SyncedSchedule>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT anki_card_id, amber_due as "amber_due: NaiveDate", anki_due
            FROM anki_paired_cards WHERE profile = $1"#,
            profile
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let schedule = SyncedSchedule {
                    amber_due: row.amber_due,
                    anki_due: row.anki_due,
                };
                (AnkiCardId(row.anki_card_id), schedule)
            })
            .collect())
    }

    async fn replace_paired_cards(
        &self,
        profile: &str,
        pairs: &[AnkiCardPair],
        schedules: &HashMap<AnkiCardId, SyncedSchedule>,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!("DELETE FROM anki_paired_cards WHERE profile = $1", profile)
            .execute(&mut *tx)
            .await?;
        // One statement through JSON, as a bind per pair fails on a large collection.
        let pairs_json = serde_json::to_string(
            &pairs
                .iter()
                .map(|pair| {
                    let schedule = schedules
                        .get(&pair.anki_card_id)
                        .copied()
                        .unwrap_or_default();
                    (
                        pair.card_id.hyphenated().to_string(),
                        pair.anki_card_id,
                        schedule.amber_due.map(|date| date.to_string()),
                        schedule.anki_due,
                    )
                })
                .collect::<Vec<_>>(),
        )
        .expect("pairs always serialize");
        sqlx::query!(
            r#"INSERT OR REPLACE INTO anki_paired_cards (profile, anki_card_id, card_id, amber_due, anki_due)
            SELECT $1, json_extract(value, '$[1]'), json_extract(value, '$[0]'),
                json_extract(value, '$[2]'), json_extract(value, '$[3]')
            FROM json_each($2)"#,
            profile,
            pairs_json,
        )
        .execute(&mut *tx)
        .await?;
        // Marks the links on the synced table, as the pairs stay on this device.
        sqlx::query!(
            "UPDATE anki_card_links SET synced = 1
            WHERE synced = 0 AND card_id IN (SELECT card_id FROM anki_paired_cards WHERE profile = $1)",
            profile,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_skipped_cards(&self, profile: &str) -> Result<Vec<AnkiCardId>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let cards = sqlx::query_scalar!(
            "SELECT anki_card_id FROM anki_skipped_cards WHERE profile = $1",
            profile
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(cards.into_iter().map(AnkiCardId).collect())
    }

    async fn add_skipped_cards(
        &self,
        profile: &str,
        anki_cards: &[AnkiCardId],
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // One statement through JSON, as a bind per card fails on a large collection.
        let cards_json = serde_json::to_string(anki_cards).expect("ids always serialize");
        sqlx::query!(
            r#"INSERT OR REPLACE INTO anki_skipped_cards (profile, anki_card_id)
            SELECT $1, value FROM json_each($2)"#,
            profile,
            cards_json,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_imported_note_hashes(
        &self,
        profile: &str,
        notes: &[AnkiNoteId],
    ) -> Result<HashMap<AnkiNoteId, String>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let notes_json = serde_json::to_string(notes).expect("ids always serialize");
        let rows = sqlx::query!(
            r#"SELECT note_id, fields_hash FROM anki_imported_notes
            WHERE profile = $1 AND note_id IN (SELECT value FROM json_each($2))"#,
            profile,
            notes_json,
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (AnkiNoteId(row.note_id), row.fields_hash))
            .collect())
    }

    async fn save_imported_note_hashes(
        &self,
        profile: &str,
        hashes: &[(AnkiNoteId, String)],
    ) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // One statement through JSON, as a bind per note fails on a large collection.
        let hashes_json = serde_json::to_string(hashes).expect("hashes always serialize");
        sqlx::query!(
            r#"INSERT OR REPLACE INTO anki_imported_notes (profile, note_id, fields_hash)
            SELECT $1, value ->> 0, value ->> 1 FROM json_each($2)"#,
            profile,
            hashes_json,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_answered_reviews(&self) -> Result<HashMap<i64, i64>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows =
            sqlx::query!("SELECT anki_review_id, amber_reviewed_at FROM anki_answered_reviews")
                .fetch_all(&mut *tx)
                .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| Some((row.anki_review_id.parse().ok()?, row.amber_reviewed_at)))
            .collect())
    }

    async fn save_answered_reviews(&self, reviews: &[(i64, i64)]) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // Text keys, as cloud sync keys rows by text.
        let rows: Vec<(String, i64)> = reviews
            .iter()
            .map(|(anki_review_id, second)| (anki_review_id.to_string(), *second))
            .collect();
        let reviews_json = serde_json::to_string(&rows).expect("ids always serialize");
        sqlx::query!(
            r#"INSERT OR REPLACE INTO anki_answered_reviews (anki_review_id, amber_reviewed_at)
            SELECT value ->> 0, value ->> 1 FROM json_each($1)"#,
            reviews_json,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }
}
