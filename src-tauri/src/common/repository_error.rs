use thiserror::Error;

use crate::SourceError;

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("The requested record was not found")]
    NotFound(#[source] SourceError),

    #[error("A record with the same unique identifier already exists")]
    Conflict(#[source] SourceError),

    #[error("Could not reach the database, please try again")]
    ConnectionFailed(#[source] SourceError),

    #[error("The database is busy, please try again in a moment")]
    Busy(#[source] SourceError),

    #[error("A database error occurred, please try again")]
    QueryFailed(#[source] SourceError),
}

/// SQLite's `SQLITE_BUSY`/`SQLITE_LOCKED` primary result codes (5 and 6 —
/// extended codes like `SQLITE_BUSY_SNAPSHOT` preserve these in their low
/// byte). Both surface as "database is locked"/"database table is locked"
/// and mean a writer collided with another connection, not a real query bug.
fn is_sqlite_busy(db_err: &dyn sqlx::error::DatabaseError) -> bool {
    db_err
        .code()
        .and_then(|code| code.parse::<i32>().ok())
        .is_some_and(|code| matches!(code & 0xff, 5 | 6))
}

impl PartialEq for RepositoryError {
    fn eq(&self, other: &Self) -> bool {
        std::mem::discriminant(self) == std::mem::discriminant(other)
    }
}

impl Eq for RepositoryError {}

impl From<sqlx::Error> for RepositoryError {
    fn from(err: sqlx::Error) -> Self {
        match &err {
            sqlx::Error::RowNotFound => Self::NotFound(Box::new(err)),
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                Self::Conflict(Box::new(err))
            }
            sqlx::Error::Database(db_err) if db_err.is_foreign_key_violation() => {
                Self::Conflict(Box::new(err))
            }
            sqlx::Error::Database(db_err) if is_sqlite_busy(db_err.as_ref()) => {
                Self::Busy(Box::new(err))
            }
            sqlx::Error::PoolTimedOut | sqlx::Error::PoolClosed => {
                Self::ConnectionFailed(Box::new(err))
            }
            _ => Self::QueryFailed(Box::new(err)),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{ConnectOptions, Connection, Executor};
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn from_sqlx_error_database_locked_by_another_writer_returns_busy() {
        // Arrange — SQLite's default (non-WAL) journal mode locks the whole

        // file for the duration of a write transaction, so a second
        // connection with no busy timeout fails immediately with
        // `SQLITE_BUSY` when it tries to write concurrently.

        let db_path = std::env::temp_dir().join(format!("amber_busy_test_{}.db", Uuid::new_v4()));

        let mut holder = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true)
            .connect()
            .await
            .unwrap();
        holder.execute("CREATE TABLE t (id INTEGER)").await.unwrap();
        let mut holder_tx = holder.begin().await.unwrap();
        holder_tx
            .execute("INSERT INTO t (id) VALUES (1)")
            .await
            .unwrap();

        let mut contender = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true)
            .busy_timeout(Duration::ZERO)
            .connect()
            .await
            .unwrap();

        // Act

        let result = contender.execute("INSERT INTO t (id) VALUES (2)").await;

        // Assert

        let actual = RepositoryError::from(result.unwrap_err());
        assert_eq!(
            RepositoryError::Busy(Box::new(sqlx::Error::RowNotFound)),
            actual
        );

        drop(holder_tx);
        let _ = std::fs::remove_file(&db_path);
    }
}
