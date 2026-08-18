use std::collections::HashSet;

use sqlx::{Row, SqliteConnection};

use super::column_info::{column_affinity, read_table_info};
use super::trigger_sql::quote_ident;
use crate::sync::errors::SyncError;
use crate::sync::value_objects::fk_policy::FkPolicy;

/// A foreign-key repair policy loaded from `sync_fk_policies` (see
/// `register::register_table`).
struct StoredFkPolicy {
    tbl: String,
    col: String,
    ref_tbl: String,
    ref_col: String,
    policy: FkPolicy,
}

/// One declared SQL foreign key (`PRAGMA foreign_key_list`) on a registered
/// table, used for the fallback discard pass on columns with no configured
/// policy (see `repair_foreign_keys`).
struct DeclaredFk {
    tbl: String,
    from: String,
    to: String,
}

/// Resolves every dangling foreign-key reference among synced tables:
/// configured policies (`sync_fk_policies`) run first, then any declared SQL
/// FK left unconfigured falls back to discarding the violating row. Runs to
/// a fixpoint, since discarding a row (or nulling/defaulting one) can newly
/// orphan a row linked only by an implicit (non-SQL) reference that is
/// itself configured. Must be called with the sync change-tracking triggers
/// active (i.e. outside the `sync_applying` guard), so repairs are recorded
/// as local changes and pushed to the server.
pub(super) async fn repair_foreign_keys(tx: &mut SqliteConnection) -> Result<(), SyncError> {
    let policies = load_policies(tx).await?;
    let configured: HashSet<(String, String)> = policies
        .iter()
        .map(|p| (p.tbl.clone(), p.col.clone()))
        .collect();

    const MAX_ITERATIONS: usize = 64;
    for _ in 0..MAX_ITERATIONS {
        let mut changed = 0;
        for policy in &policies {
            changed += apply_policy(tx, policy).await?;
        }
        changed += discard_unconfigured_violations(tx, &configured).await?;

        if changed == 0 {
            return Ok(());
        }
    }

    Err(SyncError::FkRepairDidNotConverge)
}

/// Whether any synced-table row currently violates a declared or configured
/// foreign key. Checks configured policies directly (covers implicit,
/// non-SQL references) and `PRAGMA foreign_key_check` for every registered
/// table (covers declared SQL FKs with no configured policy).
pub(super) async fn has_unresolved_foreign_keys(
    tx: &mut SqliteConnection,
) -> Result<bool, SyncError> {
    for policy in load_policies(tx).await? {
        let predicate =
            violation_predicate(&policy.tbl, &policy.col, &policy.ref_tbl, &policy.ref_col);
        let sql = format!(
            "SELECT EXISTS(SELECT 1 FROM {} WHERE {predicate})",
            quote_ident(&policy.tbl)
        );
        let exists: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
            .fetch_one(&mut *tx)
            .await?;
        if exists {
            return Ok(true);
        }
    }

    for table in registered_tables(tx).await? {
        let sql = format!("PRAGMA foreign_key_check({})", quote_ident(&table));
        let violation = sqlx::query(sqlx::AssertSqlSafe(sql))
            .fetch_optional(&mut *tx)
            .await?;
        if violation.is_some() {
            return Ok(true);
        }
    }

    Ok(false)
}

async fn load_policies(tx: &mut SqliteConnection) -> Result<Vec<StoredFkPolicy>, SyncError> {
    let rows = sqlx::query(
        "SELECT tbl, col, ref_tbl, ref_col, policy, default_value FROM sync_fk_policies",
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut policies = Vec::with_capacity(rows.len());
    for row in rows {
        let kind: String = row.try_get("policy")?;
        let default_value: Option<String> = row.try_get("default_value")?;
        policies.push(StoredFkPolicy {
            tbl: row.try_get("tbl")?,
            col: row.try_get("col")?,
            ref_tbl: row.try_get("ref_tbl")?,
            ref_col: row.try_get("ref_col")?,
            policy: FkPolicy::from_parts(&kind, default_value)?,
        });
    }

    Ok(policies)
}

async fn apply_policy(
    tx: &mut SqliteConnection,
    policy: &StoredFkPolicy,
) -> Result<u64, SyncError> {
    let predicate = violation_predicate(&policy.tbl, &policy.col, &policy.ref_tbl, &policy.ref_col);
    let table = quote_ident(&policy.tbl);
    let col = quote_ident(&policy.col);

    let rows_affected = match &policy.policy {
        FkPolicy::SetNull => {
            let sql = format!("UPDATE {table} SET {col} = NULL WHERE {predicate}");
            sqlx::query(sqlx::AssertSqlSafe(sql))
                .execute(&mut *tx)
                .await?
                .rows_affected()
        }
        FkPolicy::SetDefault(value) => {
            let affinity = column_affinity_of(tx, &policy.tbl, &policy.col).await?;
            let sql = format!(
                "UPDATE {table} SET {col} = CAST(?1 AS {affinity})
                 WHERE {predicate} AND {table}.{col} IS NOT CAST(?1 AS {affinity})"
            );
            sqlx::query(sqlx::AssertSqlSafe(sql))
                .bind(value)
                .execute(&mut *tx)
                .await?
                .rows_affected()
        }
        FkPolicy::DiscardRow => {
            let sql = format!("DELETE FROM {table} WHERE {predicate}");
            sqlx::query(sqlx::AssertSqlSafe(sql))
                .execute(&mut *tx)
                .await?
                .rows_affected()
        }
    };

    Ok(rows_affected)
}

/// Discards rows violating a declared SQL FK that has no configured policy
/// on the same `(table, column)` (the fallback for decision 2).
async fn discard_unconfigured_violations(
    tx: &mut SqliteConnection,
    configured: &HashSet<(String, String)>,
) -> Result<u64, SyncError> {
    let mut total = 0;
    for table in registered_tables(tx).await? {
        for fk in declared_foreign_keys(tx, &table).await? {
            if configured.contains(&(table.clone(), fk.from.clone())) {
                continue;
            }
            let predicate = violation_predicate(&table, &fk.from, &fk.tbl, &fk.to);
            let sql = format!("DELETE FROM {} WHERE {predicate}", quote_ident(&table));
            total += sqlx::query(sqlx::AssertSqlSafe(sql))
                .execute(&mut *tx)
                .await?
                .rows_affected();
        }
    }
    Ok(total)
}

async fn registered_tables(tx: &mut SqliteConnection) -> Result<Vec<String>, SyncError> {
    let rows = sqlx::query_scalar("SELECT tbl FROM sync_registry")
        .fetch_all(&mut *tx)
        .await?;
    Ok(rows)
}

/// Declared SQL foreign keys for `table`, via `PRAGMA foreign_key_list`. A
/// `NULL` "to" column means the FK targets the parent's primary key, which
/// this codebase always models as a single TEXT column (see
/// `column_info::primary_key_columns`), so it is resolved from
/// `PRAGMA table_info` on the parent.
async fn declared_foreign_keys(
    tx: &mut SqliteConnection,
    table: &str,
) -> Result<Vec<DeclaredFk>, SyncError> {
    let sql = format!("PRAGMA foreign_key_list({})", quote_ident(table));
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .fetch_all(&mut *tx)
        .await?;

    let mut fks = Vec::with_capacity(rows.len());
    for row in rows {
        let parent_table: String = row.try_get("table")?;
        let from: String = row.try_get("from")?;
        let to: Option<String> = row.try_get("to")?;
        let to = match to {
            Some(to) => to,
            None => {
                let parent_columns = read_table_info(tx, &parent_table).await?;
                parent_columns
                    .into_iter()
                    .find(|c| c.is_primary_key())
                    .map(|c| c.name)
                    .ok_or_else(|| SyncError::InvalidPrimaryKey {
                        table: parent_table.clone(),
                        details: "table has no primary key".to_string(),
                    })?
            }
        };
        fks.push(DeclaredFk {
            tbl: parent_table,
            from,
            to,
        });
    }

    Ok(fks)
}

/// The `NOT EXISTS` predicate for one FK relationship: true for a row in
/// `table` whose `column` is set but has no matching row in
/// `referenced_table.referenced_column`.
fn violation_predicate(
    table: &str,
    column: &str,
    referenced_table: &str,
    referenced_column: &str,
) -> String {
    format!(
        "{table}.{col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM {ref_tbl} WHERE {ref_tbl}.{ref_col} = {table}.{col})",
        table = quote_ident(table),
        col = quote_ident(column),
        ref_tbl = quote_ident(referenced_table),
        ref_col = quote_ident(referenced_column),
    )
}

async fn column_affinity_of(
    tx: &mut SqliteConnection,
    table: &str,
    column: &str,
) -> Result<&'static str, SyncError> {
    let columns = read_table_info(tx, table).await?;
    let info =
        columns
            .iter()
            .find(|c| c.name == column)
            .ok_or_else(|| SyncError::UnknownColumn {
                table: table.to_string(),
                col: column.to_string(),
            })?;
    Ok(column_affinity(&info.col_type))
}
