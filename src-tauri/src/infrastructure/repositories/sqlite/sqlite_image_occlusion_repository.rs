use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::entities::image_occlusion_card_link::ImageOcclusionCardLink;
use crate::image_occlusion::repositories::image_occlusion_repository::ImageOcclusionRepository;
use crate::infrastructure::repositories::sqlite::sqlite_rows::image_occlusion_card_link_row::ImageOcclusionCardLinkRow;
use crate::infrastructure::repositories::sqlite::sqlite_rows::image_occlusion_row::ImageOcclusionRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteImageOcclusionRepository {
    tx: Arc<DbTransaction>,
}

fn shapes_json(occlusion: &ImageOcclusion) -> Result<String, RepositoryError> {
    serde_json::to_string(&occlusion.shapes)
        .map_err(|err| RepositoryError::QueryFailed(Box::new(err)))
}

#[async_trait]
impl ImageOcclusionRepository for SqliteImageOcclusionRepository {
    async fn create(&self, occlusion: &ImageOcclusion) -> Result<(), RepositoryError> {
        let shapes = shapes_json(occlusion)?;
        let mode = occlusion.mode.as_str();
        let image_asset_id = occlusion.image_asset_id.as_str();
        let parent_id = occlusion.parent_id.map(|id| id.hyphenated());
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO image_occlusions (id, name, image_asset_id, image_width, image_height, shapes, mode, parent_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
            occlusion.id.hyphenated(),
            occlusion.name,
            image_asset_id,
            occlusion.image_width,
            occlusion.image_height,
            shapes,
            mode,
            parent_id,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn update(&self, occlusion: &ImageOcclusion) -> Result<(), RepositoryError> {
        let shapes = shapes_json(occlusion)?;
        let mode = occlusion.mode.as_str();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"UPDATE image_occlusions SET shapes = $1, mode = $2 WHERE id = $3"#,
            shapes,
            mode,
            occlusion.id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<ImageOcclusion, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            ImageOcclusionRow,
            r#"SELECT
                id as "id: _",
                name,
                image_asset_id,
                image_width,
                image_height,
                shapes,
                mode,
                parent_id as "parent_id: _"
            FROM image_occlusions
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        row.try_into()
    }

    async fn find_id_by_source(
        &self,
        parent_id: Uuid,
        image_asset_id: &AssetId,
    ) -> Result<Option<Uuid>, RepositoryError> {
        let image_asset_id = image_asset_id.as_str();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query!(
            r#"SELECT id as "id: Hyphenated"
            FROM image_occlusions
            WHERE parent_id = $1 AND image_asset_id = $2
            ORDER BY created_at, id
            LIMIT 1"#,
            parent_id.hyphenated(),
            image_asset_id,
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|row| row.id.into_uuid()))
    }

    async fn link_card(&self, link: &ImageOcclusionCardLink) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO image_occlusion_cards (card_id, occlusion_id, target_key)
            VALUES ($1, $2, $3)"#,
            link.card_id.hyphenated(),
            link.occlusion_id.hyphenated(),
            link.target_key,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn unlink_card(&self, card_id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            "DELETE FROM image_occlusion_cards WHERE card_id = $1",
            card_id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn get_links(
        &self,
        occlusion_id: Uuid,
    ) -> Result<Vec<ImageOcclusionCardLink>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            ImageOcclusionCardLinkRow,
            r#"SELECT
                card_id as "card_id: _",
                occlusion_id as "occlusion_id: _",
                target_key
            FROM image_occlusion_cards
            WHERE occlusion_id = $1"#,
            occlusion_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn get_live_linked_card_ids(
        &self,
        occlusion_id: Uuid,
    ) -> Result<Vec<Uuid>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // Walks every linked card's ancestry at once; like `has_live_ancestry`, a parent_id
        // that no longer resolves to a row breaks the chain.
        let rows = sqlx::query!(
            r#"WITH RECURSIVE ancestry(card_id, parent_id, trashed_at) AS (
                SELECT l.card_id, m.parent_id, m.trashed_at
                FROM image_occlusion_cards l JOIN meta m ON m.element_id = l.card_id
                WHERE l.occlusion_id = $1
                UNION ALL
                SELECT a.card_id, m.parent_id, m.trashed_at
                FROM meta m JOIN ancestry a ON m.element_id = a.parent_id
            )
            SELECT card_id as "card_id!: Hyphenated"
            FROM ancestry a
            GROUP BY card_id
            HAVING SUM(
                a.trashed_at IS NOT NULL
                OR (a.parent_id IS NOT NULL
                    AND NOT EXISTS(SELECT 1 FROM meta p WHERE p.element_id = a.parent_id))
            ) = 0"#,
            occlusion_id.hyphenated()
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| row.card_id.into_uuid())
            .collect())
    }
}
