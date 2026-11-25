use sqlx::{Row, SqliteConnection};

use crate::generated_code::{CellChange, ChangeBatch};
use crate::sync::errors::SyncError;
use crate::sync::hlc::{Hlc, HlcClock};

use super::schema_gate;

/// Stores a pulled page in `sync_inbox`, all or nothing, writing first so the transaction takes the write
/// lock before it reads. Advances `clock` past the page, so a later local edit outranks it.
pub(super) async fn stage(
    tx: &mut SqliteConnection,
    batch: &ChangeBatch,
    clock: &HlcClock,
) -> Result<(), SyncError> {
    sqlx::query("SAVEPOINT stage_remote")
        .execute(&mut *tx)
        .await?;
    let result = insert_checked(&mut *tx, batch).await;
    if result.is_err() {
        sqlx::query("ROLLBACK TO SAVEPOINT stage_remote")
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("RELEASE SAVEPOINT stage_remote")
        .execute(&mut *tx)
        .await?;
    result?;

    for cell in &batch.cells {
        clock.observe(&Hlc::parse(&cell.hlc)?);
    }

    Ok(())
}

async fn insert_checked(tx: &mut SqliteConnection, batch: &ChangeBatch) -> Result<(), SyncError> {
    for cell in &batch.cells {
        // Parsed now, so a malformed HLC refuses the page instead of stalling every later apply.
        Hlc::parse(&cell.hlc)?;
        sqlx::query(
            "INSERT INTO sync_inbox(tbl, row_id, col, value, hlc, device_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&cell.tbl)
        .bind(&cell.row_id)
        .bind(&cell.col)
        .bind(cell.value.as_deref())
        .bind(&cell.hlc)
        .bind(&cell.device_id)
        .execute(&mut *tx)
        .await?;
    }

    schema_gate::ensure_schema_supported(tx, batch).await
}

/// Removes and returns the oldest `limit` staged cells plus every other staged cell of their rows, in pull
/// order: a row's tables share its `row_id`, so a batch never commits an element's meta without its content.
/// A delete is the first statement, so the transaction holds the write lock from its start.
pub(super) async fn take(
    tx: &mut SqliteConnection,
    limit: usize,
) -> Result<ChangeBatch, SyncError> {
    let limit = i64::try_from(limit.max(1)).unwrap_or(i64::MAX);
    let rows = sqlx::query(
        "DELETE FROM sync_inbox
         WHERE row_id IN (SELECT row_id FROM sync_inbox ORDER BY seq LIMIT ?1)
         RETURNING seq, tbl, row_id, col, value, hlc, device_id",
    )
    .bind(limit)
    .fetch_all(&mut *tx)
    .await?;

    let mut staged = Vec::with_capacity(rows.len());
    for row in rows {
        let seq: i64 = row.try_get("seq")?;
        staged.push((
            seq,
            CellChange {
                tbl: row.try_get("tbl")?,
                row_id: row.try_get("row_id")?,
                col: row.try_get("col")?,
                value: row.try_get("value")?,
                hlc: row.try_get("hlc")?,
                device_id: row.try_get("device_id")?,
            },
        ));
    }
    // `RETURNING` gives no order.
    staged.sort_unstable_by_key(|(seq, _)| *seq);

    Ok(ChangeBatch {
        cells: staged.into_iter().map(|(_, cell)| cell).collect(),
    })
}

pub(super) async fn has_staged(tx: &mut SqliteConnection) -> Result<bool, SyncError> {
    Ok(
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM sync_inbox)")
            .fetch_one(&mut *tx)
            .await?,
    )
}
