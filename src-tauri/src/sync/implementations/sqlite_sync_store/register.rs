use sqlx::SqliteConnection;

use super::column_info::{read_table_info, text_primary_key_columns};
use super::models::TableSchema;
use super::trigger_sql;
use crate::sync::errors::SyncError;
use crate::sync::value_objects::granularity::Granularity;

pub(super) async fn register_table(
    tx: &mut SqliteConnection,
    table: &str,
    granularity: Granularity,
) -> Result<(), SyncError> {
    let columns = read_table_info(tx, table).await?;
    if columns.is_empty() {
        return Err(SyncError::TableNotFound(table.to_string()));
    }

    let pk_columns: Vec<String> = text_primary_key_columns(table, &columns)?
        .iter()
        .map(|c| c.name.clone())
        .collect();

    let existing: Option<String> =
        sqlx::query_scalar("SELECT granularity FROM sync_registry WHERE tbl = ?1")
            .bind(table)
            .fetch_optional(&mut *tx)
            .await?;

    if let Some(existing) = &existing
        && existing != &granularity.to_string()
    {
        return Err(SyncError::GranularityMismatch {
            table: table.to_string(),
            existing: existing.clone(),
            requested: granularity.to_string(),
        });
    }

    sqlx::query(
        "INSERT INTO sync_registry(tbl, granularity) VALUES (?1, ?2)
         ON CONFLICT(tbl) DO UPDATE SET granularity = excluded.granularity",
    )
    .bind(table)
    .bind(granularity.to_string())
    .execute(&mut *tx)
    .await?;

    let non_pk_columns: Vec<String> = columns
        .iter()
        .filter(|c| !c.is_primary_key())
        .map(|c| c.name.clone())
        .collect();

    let schema = TableSchema {
        name: table.to_string(),
        pk_columns,
        columns: non_pk_columns,
    };

    // Dropping the old triggers before creating new.
    for drop_sql in trigger_sql::drop_trigger_sql(table) {
        sqlx::query(sqlx::AssertSqlSafe(drop_sql))
            .execute(&mut *tx)
            .await?;
    }

    let create_statements = match granularity {
        Granularity::Column => trigger_sql::column_mode_triggers(&schema),
        Granularity::Row => trigger_sql::row_mode_triggers(&schema),
    };
    for statement in create_statements {
        sqlx::query(sqlx::AssertSqlSafe(statement))
            .execute(&mut *tx)
            .await?;
    }

    Ok(())
}
