use std::collections::HashSet;

use sqlx::{Row, SqliteConnection};

use super::column_info::{column_affinity, read_table_info};
use super::trigger_sql::quote_ident;
use crate::sync::errors::SyncError;
use crate::sync::utils::merge;
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
/// table, used for the fallback discard pass on columns with no policy.
struct DeclaredFk {
    tbl: String,
    from: String,
    to: String,
}

/// A reference whose orphaned rows are discarded once their parent is known to be deleted.
struct DiscardReference {
    tbl: String,
    col: String,
    ref_tbl: String,
    ref_col: String,
}

/// Resolves dangling references, to a fixpoint. A row is only discarded if its parent has a
/// tombstone, as a discard reaches every device; other orphans wait and hold the cursor back.
pub(super) async fn repair_foreign_keys(tx: &mut SqliteConnection) -> Result<(), SyncError> {
    let policies = load_policies(tx).await?;
    let discard_references = load_discard_references(tx, &policies).await?;

    const MAX_ITERATIONS: usize = 64;
    for _ in 0..MAX_ITERATIONS {
        let mut changed = 0;
        for policy in &policies {
            changed += apply_policy(tx, policy).await?;
        }
        for reference in &discard_references {
            changed += discard_orphans(tx, reference).await?;
        }

        if changed == 0 {
            return log_waiting_rows(tx, &discard_references).await;
        }
    }

    Err(SyncError::FkRepairDidNotConverge)
}

/// Whether any synced-table row currently violates a declared or configured
/// foreign key: configured policies cover implicit non-SQL references,
/// `PRAGMA foreign_key_check` covers declared SQL FKs without a policy.
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
        // Handled by `discard_orphans`, which also needs the parent's tombstone.
        FkPolicy::DiscardRow => 0,
    };

    if rows_affected > 0 {
        log::warn!(
            "FK repair reset {rows_affected} dangling reference(s) {}.{} -> {}.{}",
            policy.tbl,
            policy.col,
            policy.ref_tbl,
            policy.ref_col
        );
    }

    Ok(rows_affected)
}

/// Every discarding reference: `DiscardRow` policies, plus declared SQL FKs with no policy.
async fn load_discard_references(
    tx: &mut SqliteConnection,
    policies: &[StoredFkPolicy],
) -> Result<Vec<DiscardReference>, SyncError> {
    let configured: HashSet<(&str, &str)> = policies
        .iter()
        .map(|p| (p.tbl.as_str(), p.col.as_str()))
        .collect();

    let mut references: Vec<DiscardReference> = policies
        .iter()
        .filter(|p| matches!(p.policy, FkPolicy::DiscardRow))
        .map(|p| DiscardReference {
            tbl: p.tbl.clone(),
            col: p.col.clone(),
            ref_tbl: p.ref_tbl.clone(),
            ref_col: p.ref_col.clone(),
        })
        .collect();

    for table in registered_tables(tx).await? {
        for fk in declared_foreign_keys(tx, &table).await? {
            if !configured.contains(&(table.as_str(), fk.from.as_str())) {
                references.push(DiscardReference {
                    tbl: table.clone(),
                    col: fk.from,
                    ref_tbl: fk.tbl,
                    ref_col: fk.to,
                });
            }
        }
    }

    Ok(references)
}

async fn discard_orphans(
    tx: &mut SqliteConnection,
    reference: &DiscardReference,
) -> Result<u64, SyncError> {
    let sql = format!(
        "DELETE FROM {} WHERE {}",
        quote_ident(&reference.tbl),
        orphan_predicate(reference, true)
    );
    let rows_affected = sqlx::query(sqlx::AssertSqlSafe(sql))
        .execute(&mut *tx)
        .await?
        .rows_affected();

    if rows_affected > 0 {
        log::warn!(
            "FK repair discarded {rows_affected} row(s) from '{}': deleted parent in {}.{}",
            reference.tbl,
            reference.ref_tbl,
            reference.ref_col
        );
    }

    Ok(rows_affected)
}

async fn log_waiting_rows(
    tx: &mut SqliteConnection,
    references: &[DiscardReference],
) -> Result<(), SyncError> {
    for reference in references {
        let sql = format!(
            "SELECT COUNT(*) FROM {} WHERE {}",
            quote_ident(&reference.tbl),
            orphan_predicate(reference, false)
        );
        let waiting: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
            .fetch_one(&mut *tx)
            .await?;
        if waiting > 0 {
            log::warn!(
                "FK repair kept {waiting} row(s) in '{}': parent in {}.{} is absent but not \
                 deleted, so the pull cursor stays back until it arrives",
                reference.tbl,
                reference.ref_tbl,
                reference.ref_col
            );
        }
    }

    Ok(())
}

/// Rows violating `reference` whose parent does (or doesn't) have a tombstone.
fn orphan_predicate(reference: &DiscardReference, parent_deleted: bool) -> String {
    let violation = violation_predicate(
        &reference.tbl,
        &reference.col,
        &reference.ref_tbl,
        &reference.ref_col,
    );
    let tombstone = format!(
        "EXISTS (SELECT 1 FROM sync_cells WHERE sync_cells.tbl = '{ref_tbl}' \
         AND sync_cells.row_id = json_array({table}.{col}) AND sync_cells.col = '{deleted}')",
        ref_tbl = reference.ref_tbl.replace('\'', "''"),
        table = quote_ident(&reference.tbl),
        col = quote_ident(&reference.col),
        deleted = merge::DELETED_COL,
    );
    let negation = if parent_deleted { "" } else { "NOT " };

    format!("{violation} AND {negation}{tombstone}")
}

async fn registered_tables(tx: &mut SqliteConnection) -> Result<Vec<String>, SyncError> {
    let rows = sqlx::query_scalar("SELECT tbl FROM sync_registry")
        .fetch_all(&mut *tx)
        .await?;
    Ok(rows)
}

/// Declared SQL foreign keys for `table`, via `PRAGMA foreign_key_list`. A
/// `NULL` "to" column means the FK targets the parent's primary key, resolved
/// from `PRAGMA table_info` on the parent.
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

/// Alias for the referenced table inside a [`violation_predicate`] subquery.
/// Required for self-referential FKs: unaliased, the subquery would shadow the
/// outer row's table name and make `NOT EXISTS` spuriously true.
const VIOLATION_PREDICATE_REF_ALIAS: &str = "__fk_ref";

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
        "{table}.{col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM {ref_tbl} AS {alias} WHERE {alias}.{ref_col} = {table}.{col})",
        table = quote_ident(table),
        col = quote_ident(column),
        ref_tbl = quote_ident(referenced_table),
        ref_col = quote_ident(referenced_column),
        alias = quote_ident(VIOLATION_PREDICATE_REF_ALIAS),
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
