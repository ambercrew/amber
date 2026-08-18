use sqlx::SqliteConnection;

use super::column_info::{primary_key_columns, read_table_info};
use super::models::TableSchema;
use super::trigger_sql;
use crate::sync::errors::SyncError;
use crate::sync::value_objects::fk_constraint::FkConstraint;
use crate::sync::value_objects::fk_policy::FkPolicy;
use crate::sync::value_objects::granularity::Granularity;

pub(crate) async fn register_table(
    tx: &mut SqliteConnection,
    table: &str,
    granularity: Granularity,
    fk_constraints: &[FkConstraint],
) -> Result<(), SyncError> {
    let columns = read_table_info(tx, table).await?;
    if columns.is_empty() {
        return Err(SyncError::TableNotFound(table.to_string()));
    }

    for constraint in fk_constraints {
        let column = columns
            .iter()
            .find(|c| c.name == constraint.column)
            .ok_or_else(|| SyncError::UnknownColumn {
                table: table.to_string(),
                col: constraint.column.clone(),
            })?;
        if constraint.policy == FkPolicy::SetNull && column.notnull {
            return Err(SyncError::InvalidFkPolicy {
                table: table.to_string(),
                col: constraint.column.clone(),
                reason: "cannot set a NOT NULL column to NULL".to_string(),
            });
        }
    }

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

    let pk_columns: Vec<String> = primary_key_columns(table, &columns)?
        .iter()
        .map(|c| c.name.clone())
        .collect();

    let schema = TableSchema {
        name: table.to_string(),
        pk_columns,
        non_pk_columns,
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

    sqlx::query("DELETE FROM sync_fk_policies WHERE tbl = ?1")
        .bind(table)
        .execute(&mut *tx)
        .await?;
    for constraint in fk_constraints {
        sqlx::query(
            "INSERT INTO sync_fk_policies(tbl, col, ref_tbl, ref_col, policy, default_value)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(table)
        .bind(&constraint.column)
        .bind(&constraint.referenced_table)
        .bind(&constraint.referenced_column)
        .bind(constraint.policy.kind())
        .bind(constraint.policy.default_value())
        .execute(&mut *tx)
        .await?;
    }

    Ok(())
}
