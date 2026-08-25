use std::sync::{Arc, OnceLock};

use sqlx::{Row, SqlitePool};

use crate::sync::hlc::{DeviceId, Hlc, HlcClock};

/// The `local_configurations` row holding the sync device id of the database
/// it lives in.
pub const DEVICE_ID_CONFIG: &str = "sync_device_id";

/// The HLC clock of one database: created by `create_sqlite_pool` alongside its
/// pool, given to every connection as the `hlc_now()` / `device_id()` SQL
/// functions' app data, and injected into services through `DbPool`. Owned per
/// database rather than process-wide so a second database open in the same
/// process issues HLCs under its own device id.
///
/// Empty between opening the pool and [`SyncClock::initialize`]; nothing can
/// write a cell in that window, since the sync tables don't exist yet.
#[derive(Default)]
pub struct SyncClock {
    clock: OnceLock<HlcClock>,
}

impl SyncClock {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Resolves (or creates) `pool`'s persistent device id and seeds the clock
    /// past the highest HLC that database has stored, so a restart can never
    /// reissue an HLC. Runs once per clock, after the sync tables are migrated.
    pub async fn initialize(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let device_id = get_or_create_device_id(pool).await?;

        let max_hlc: Option<String> = sqlx::query("SELECT max(hlc) AS max_hlc FROM sync_cells")
            .fetch_one(pool)
            .await?
            .try_get("max_hlc")
            .ok();

        let seed = compute_seed(
            max_hlc.and_then(|value| Hlc::parse(&value).ok()),
            crate::sync::hlc::wall_time_ms(),
            device_id,
        );

        assert!(
            self.clock.set(HlcClock::new(seed)).is_ok(),
            "a database's sync clock is seeded exactly once, by create_sqlite_pool"
        );

        Ok(())
    }

    /// `None` until [`SyncClock::initialize`] has seeded this clock. Only the SQL
    /// functions need this: they are registered before seeding is possible.
    pub fn try_get(&self) -> Option<&HlcClock> {
        self.clock.get()
    }

    /// Panics unless [`SyncClock::initialize`] has run, which
    /// `create_sqlite_pool` does before handing the clock to anything else.
    pub fn get(&self) -> &HlcClock {
        self.try_get()
            .expect("sync not initialized: create_sqlite_pool must run before sync engine use")
    }
}

/// Seeds past the highest HLC this database has seen, or from wall time on a
/// fresh database.
fn compute_seed(max_hlc: Option<Hlc>, wall_ms: u64, device_id: DeviceId) -> Hlc {
    let seed = match max_hlc {
        Some(existing) => crate::sync::hlc::tick(&existing, wall_ms),
        None => Hlc::new(wall_ms, 0, device_id),
    };
    Hlc::new(seed.physical_ms, seed.counter, device_id)
}

async fn get_or_create_device_id(pool: &SqlitePool) -> Result<DeviceId, sqlx::Error> {
    let existing: Option<String> =
        sqlx::query("SELECT value FROM local_configurations WHERE name = ?1")
            .bind(DEVICE_ID_CONFIG)
            .fetch_optional(pool)
            .await?
            .and_then(|row| row.try_get("value").ok());

    if let Some(device_id) = existing {
        return Ok(device_id
            .parse()
            .expect("device_id column always holds a valid UUID"));
    }

    let device_id = DeviceId::new_v4();
    sqlx::query(
        "INSERT INTO local_configurations(name, value) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET value = local_configurations.value",
    )
    .bind(DEVICE_ID_CONFIG)
    .bind(device_id.to_string())
    .execute(pool)
    .await?;

    let device_id: String = sqlx::query("SELECT value FROM local_configurations WHERE name = ?1")
        .bind(DEVICE_ID_CONFIG)
        .fetch_one(pool)
        .await?
        .try_get("value")?;

    Ok(device_id
        .parse()
        .expect("device_id column always holds a valid UUID"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::utils::create_sqlite_pool::create_sqlite_pool;

    async fn delete_device_id(pool: &SqlitePool) {
        sqlx::query("DELETE FROM local_configurations WHERE name = ?1")
            .bind(DEVICE_ID_CONFIG)
            .execute(pool)
            .await
            .unwrap();
    }

    #[test]
    fn compute_seed_with_existing_max_hlc_exceeds_it() {
        // Arrange

        let max_hlc = Hlc::new(1_000_000, 5, DeviceId::from_name("device-a"));

        // Act

        let actual = compute_seed(Some(max_hlc.clone()), 500, DeviceId::from_name("device-b"));

        // Assert

        assert!(actual > max_hlc);
        assert_eq!(DeviceId::from_name("device-b"), actual.device_id);
    }

    #[test]
    fn compute_seed_without_existing_hlc_uses_wall_time() {
        // Arrange

        let wall_ms = 5_000_000;

        // Act

        let actual = compute_seed(None, wall_ms, DeviceId::from_name("device-a"));

        // Assert

        assert_eq!(
            Hlc::new(wall_ms, 0, DeviceId::from_name("device-a")),
            actual
        );
    }

    #[tokio::test]
    async fn create_sqlite_pool_no_existing_database_creates_and_persists_device_id() {
        // Arrange

        // Act

        let (pool, _) = create_sqlite_pool("sqlite::memory:").await.unwrap();

        // Assert

        let device_id: String =
            sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
                .bind(DEVICE_ID_CONFIG)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(device_id.parse::<DeviceId>().is_ok());
    }

    #[tokio::test]
    async fn device_id_sql_function_two_pools_resolves_each_databases_own_device_id() {
        // Arrange

        let (first_pool, first_clock) = create_sqlite_pool("sqlite::memory:").await.unwrap();
        let (second_pool, second_clock) = create_sqlite_pool("sqlite::memory:").await.unwrap();

        // Act

        let first: String = sqlx::query_scalar("SELECT device_id()")
            .fetch_one(&first_pool)
            .await
            .unwrap();
        let second: String = sqlx::query_scalar("SELECT device_id()")
            .fetch_one(&second_pool)
            .await
            .unwrap();

        // Assert

        assert_eq!(first_clock.get().device_id().to_string(), first);
        assert_eq!(second_clock.get().device_id().to_string(), second);
        assert_ne!(first, second);
    }

    #[tokio::test]
    async fn hlc_now_sql_function_called_twice_returns_monotonically_increasing_hlcs() {
        // Arrange

        let (pool, _) = create_sqlite_pool("sqlite::memory:").await.unwrap();

        // Act

        let first: String = sqlx::query_scalar("SELECT hlc_now()")
            .fetch_one(&pool)
            .await
            .unwrap();
        let second: String = sqlx::query_scalar("SELECT hlc_now()")
            .fetch_one(&pool)
            .await
            .unwrap();

        // Assert

        assert!(Hlc::parse(&second).unwrap() > Hlc::parse(&first).unwrap());
    }

    #[tokio::test]
    async fn get_or_create_device_id_no_existing_row_creates_and_persists_valid_id() {
        // Arrange

        let (pool, _) = create_sqlite_pool("sqlite::memory:").await.unwrap();
        delete_device_id(&pool).await;

        // Act

        let actual = get_or_create_device_id(&pool).await.unwrap();

        // Assert

        let persisted: String =
            sqlx::query_scalar("SELECT value FROM local_configurations WHERE name = ?1")
                .bind(DEVICE_ID_CONFIG)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(persisted, actual.to_string());
    }

    #[tokio::test]
    async fn get_or_create_device_id_existing_row_returns_same_id_on_second_call() {
        // Arrange

        let (pool, _) = create_sqlite_pool("sqlite::memory:").await.unwrap();
        let first = get_or_create_device_id(&pool).await.unwrap();

        // Act

        let second = get_or_create_device_id(&pool).await.unwrap();

        // Assert

        assert_eq!(first, second);
    }
}
