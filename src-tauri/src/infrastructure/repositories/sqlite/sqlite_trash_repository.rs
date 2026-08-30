use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::elements::extensions::into_element_id_ext::IntoElementIdExt;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::trash::repositories::trash_repository::TrashRepository;
use crate::trash::value_objects::trashed_element::TrashedElement;

#[derive(ScopeInjectable)]
pub struct SqliteTrashRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl TrashRepository for SqliteTrashRepository {
    async fn trash(&self, id: ElementId, trashed_at: DateTime<Utc>) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"WITH RECURSIVE subtree(element_id) AS (
                SELECT element_id FROM meta WHERE element_id = $1
                UNION ALL
                SELECT m.element_id FROM meta m JOIN subtree s ON m.parent_id = s.element_id
            )
            UPDATE meta
            SET trashed_at = datetime($2),
                trashed_root = CASE WHEN element_id = $1 THEN 1 ELSE 0 END
            WHERE element_id IN (SELECT element_id FROM subtree)
              AND (element_id = $1 OR trashed_at IS NULL)"#,
            uuid,
            trashed_at
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn restore(&self, id: ElementId) -> Result<Vec<ElementId>, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"WITH RECURSIVE subtree(element_id) AS (
                SELECT element_id FROM meta WHERE element_id = $1
                UNION ALL
                SELECT m.element_id FROM meta m JOIN subtree s ON m.parent_id = s.element_id
                WHERE m.trashed_root = 0
            )
            UPDATE meta
            SET trashed_at = NULL,
                trashed_root = 0
            WHERE element_id IN (SELECT element_id FROM subtree)
            RETURNING element_id as "element_id: uuid::fmt::Hyphenated", element_type"#,
            uuid
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (row.element_id.into_uuid(), row.element_type).into_element_id())
            .collect())
    }

    async fn get_trashed_roots(&self) -> Result<Vec<TrashedElement>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"WITH RECURSIVE subtrees(root_id, element_id) AS (
                SELECT element_id, element_id FROM meta
                WHERE trashed_root = 1 AND trashed_at IS NOT NULL
                UNION ALL
                SELECT s.root_id, m.element_id FROM meta m JOIN subtrees s ON m.parent_id = s.element_id
                WHERE m.trashed_root = 0
            )
            SELECT
                m.element_id as "element_id: uuid::fmt::Hyphenated",
                m.element_type,
                m.name,
                m.trashed_at as "trashed_at!: DateTime<Utc>",
                (SELECT COUNT(*) - 1 FROM subtrees s WHERE s.root_id = m.element_id) as "descendant_count!: i64"
            FROM meta m
            WHERE m.trashed_root = 1 AND m.trashed_at IS NOT NULL
            ORDER BY m.trashed_at DESC, m.name"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| TrashedElement {
                element_id: (row.element_id.into_uuid(), row.element_type).into_element_id(),
                name: row.name,
                trashed_at: row.trashed_at,
                descendant_count: row.descendant_count,
            })
            .collect())
    }

    async fn get_roots_trashed_before(
        &self,
        cutoff: DateTime<Utc>,
    ) -> Result<Vec<ElementId>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"SELECT
                element_id as "element_id: uuid::fmt::Hyphenated",
                element_type
            FROM meta
            WHERE trashed_root = 1 AND trashed_at IS NOT NULL AND trashed_at < datetime($1)"#,
            cutoff
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (row.element_id.into_uuid(), row.element_type).into_element_id())
            .collect())
    }

    async fn trash_descendants_of_trashed(&self) -> Result<Vec<ElementId>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query!(
            r#"WITH RECURSIVE cascade(element_id, trashed_at) AS (
                SELECT child.element_id, parent.trashed_at
                FROM meta child
                JOIN meta parent ON child.parent_id = parent.element_id
                WHERE child.trashed_at IS NULL AND parent.trashed_at IS NOT NULL
                UNION ALL
                SELECT child.element_id, c.trashed_at
                FROM meta child JOIN cascade c ON child.parent_id = c.element_id
                WHERE child.trashed_at IS NULL
            )
            UPDATE meta
            SET trashed_at = (
                    SELECT c.trashed_at FROM cascade c WHERE c.element_id = meta.element_id
                ),
                trashed_root = 0
            WHERE element_id IN (SELECT element_id FROM cascade)
            RETURNING element_id as "element_id: uuid::fmt::Hyphenated", element_type"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (row.element_id.into_uuid(), row.element_type).into_element_id())
            .collect())
    }

    async fn is_trashed(&self, id: ElementId) -> Result<bool, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query!(
            r#"SELECT EXISTS(
                SELECT 1 FROM meta WHERE element_id = $1 AND trashed_at IS NOT NULL
            ) as "is_trashed: bool""#,
            uuid
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.is_trashed)
    }

    async fn has_live_ancestry(&self, id: ElementId) -> Result<bool, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // `ancestry` walks parent_id upwards, collecting the element and every
        // ancestor that still has a row. The chain is broken either by an
        // ancestor sitting in the trash, or by a parent_id that no longer
        // resolves to a row — the element's own trash state is irrelevant.
        let row = sqlx::query!(
            r#"WITH RECURSIVE ancestry(element_id, parent_id, trashed_at) AS (
                SELECT element_id, parent_id, trashed_at FROM meta WHERE element_id = $1
                UNION ALL
                SELECT m.element_id, m.parent_id, m.trashed_at
                FROM meta m JOIN ancestry a ON m.element_id = a.parent_id
            )
            SELECT NOT EXISTS(
                SELECT 1 FROM ancestry
                WHERE element_id != $1 AND trashed_at IS NOT NULL
                UNION ALL
                SELECT 1 FROM ancestry a
                WHERE a.parent_id IS NOT NULL
                  AND NOT EXISTS(SELECT 1 FROM meta p WHERE p.element_id = a.parent_id)
            ) as "has_live_ancestry: bool""#,
            uuid
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.has_live_ancestry)
    }
}
