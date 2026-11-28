use std::sync::Arc;

use async_trait::async_trait;
use injector::{injector::Injector, injector_scope::InjectorScope};
use tokio::sync::Mutex;

use crate::common::repository_error::RepositoryError;
use crate::infrastructure::value_objects::{db_pool::DbPool, db_transaction::DbTransaction};

#[async_trait]
pub trait WriteScopeExt {
    /// A scope holding the write lock from the start (`BEGIN IMMEDIATE`), for commands that write; see
    /// CLAUDE.md's "Write scopes" for why, and for the commands that must not use it.
    async fn start_write_scope(&self) -> Result<InjectorScope<'_>, RepositoryError>;
}

#[async_trait]
impl WriteScopeExt for Injector {
    async fn start_write_scope(&self) -> Result<InjectorScope<'_>, RepositoryError> {
        let db_pool = self
            .singleton::<DbPool>()
            .expect("DbPool is registered at startup");
        // Cloned out, so the pool's lock isn't held while waiting for the write lock. A database switch
        // meanwhile would leave the transaction on the old file, so it's dropped (rolled back) and retried.
        let tx = loop {
            let (pool, generation) = db_pool.current_pool().await;
            let result = pool.begin_with("BEGIN IMMEDIATE").await;
            if db_pool.is_current(generation) {
                break result?;
            }
        };

        let scope = self.start_scope();
        scope
            .provide(Arc::new(DbTransaction::new(Mutex::new(tx))))
            .await;
        Ok(scope)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::common::utils::create_sqlite_pool::create_sqlite_pool;
    use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
    use crate::settings::value_objects::database_location::DatabaseLocation;
    use crate::test_utils::create_file_backed_test_injector;

    async fn create_table(injector: &Injector) {
        let db_pool = injector.singleton::<DbPool>().unwrap();
        let pool = db_pool.pool().await.clone();
        create_table_on(&pool).await;
    }

    async fn create_table_on(pool: &sqlx::SqlitePool) {
        sqlx::query("CREATE TABLE t (id INTEGER)")
            .execute(pool)
            .await
            .unwrap();
    }

    async fn count_rows(pool: &sqlx::SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM t")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn execute(scope: &InjectorScope<'_>, sql: &'static str) -> Result<(), RepositoryError> {
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        let conn = guard.as_mut();
        sqlx::query(sql).execute(&mut *conn).await?;
        Ok(())
    }

    #[tokio::test]
    async fn start_scope_read_then_write_while_another_writes_fails_busy() {
        // Arrange

        let injector = create_file_backed_test_injector().await;
        create_table(&injector).await;
        let holder = injector.start_scope();
        execute(&holder, "INSERT INTO t (id) VALUES (1)")
            .await
            .unwrap();
        let contender = injector.start_scope();
        execute(&contender, "SELECT COUNT(*) FROM t").await.unwrap();

        // Act

        let actual = execute(&contender, "INSERT INTO t (id) VALUES (2)").await;

        // Assert

        assert_eq!(
            Err(RepositoryError::Busy(Box::new(sqlx::Error::RowNotFound))),
            actual
        );
    }

    #[tokio::test]
    async fn start_write_scope_another_writer_holds_lock_waits_then_writes() {
        // Arrange

        let injector = create_file_backed_test_injector().await;
        create_table(&injector).await;
        let holder = injector.start_scope();
        execute(&holder, "INSERT INTO t (id) VALUES (1)")
            .await
            .unwrap();

        // Act

        let (actual, _) = tokio::join!(
            async {
                let scope = injector.start_write_scope().await?;
                execute(&scope, "SELECT COUNT(*) FROM t").await?;
                execute(&scope, "INSERT INTO t (id) VALUES (2)").await?;
                scope.save_changes().await.unwrap();
                Ok::<(), RepositoryError>(())
            },
            async {
                tokio::time::sleep(Duration::from_millis(200)).await;
                holder.save_changes().await.unwrap();
            }
        );

        // Assert

        assert_eq!(Ok(()), actual);
    }

    #[tokio::test]
    async fn start_write_scope_pool_swapped_while_waiting_writes_to_new_pool() {
        // Arrange

        let injector = create_file_backed_test_injector().await;
        create_table(&injector).await;
        let db_pool = injector.singleton::<DbPool>().unwrap();
        let old_pool = db_pool.pool().await.clone();
        let directory = db_pool.location().await.get_path().clone();
        let (new_pool, new_sync_clock) = create_sqlite_pool(&format!(
            "sqlite:///{}",
            directory.join("new.db").to_string_lossy()
        ))
        .await
        .unwrap();
        create_table_on(&new_pool).await;
        let holder = injector.start_scope();
        execute(&holder, "SELECT COUNT(*) FROM t").await.unwrap();
        execute(&holder, "DELETE FROM t").await.unwrap();

        // Act

        let (actual, _) = tokio::join!(
            async {
                let scope = injector.start_write_scope().await?;
                execute(&scope, "INSERT INTO t (id) VALUES (1)").await?;
                scope.save_changes().await.unwrap();
                Ok::<(), RepositoryError>(())
            },
            async {
                tokio::time::sleep(Duration::from_millis(200)).await;
                db_pool
                    .set_pool(
                        new_pool.clone(),
                        DatabaseLocation::new_unchecked(directory.join("new.db")),
                        new_sync_clock,
                    )
                    .await;
                holder.save_changes().await.unwrap();
            }
        );

        // Assert

        assert_eq!(Ok(()), actual);
        assert_eq!(
            (0, 1),
            (count_rows(&old_pool).await, count_rows(&new_pool).await)
        );
    }
}
