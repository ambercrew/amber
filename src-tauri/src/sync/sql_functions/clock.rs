use std::sync::OnceLock;

use sqlx::{Row, SqlitePool};

use crate::sync::hlc::{DeviceId, Hlc, HlcClock};

/// Global variable that denotes the latest synced HLC clock, used by the database
/// functions.
static SYNC_CLOCK: OnceLock<HlcClock> = OnceLock::new();

pub(super) fn sync_clock_static() -> Option<&'static HlcClock> {
    SYNC_CLOCK.get()
}

/// Bootstraps the sync subsystem for a pool: resolves (or creates) this
/// device's persistent id and seeds the process-wide HLC clock. Must run after
/// the sync tables have been migrated in and `install_sync_sql_functions()`
/// has been called and the pool's connections were opened (functions attach
/// per-connection via the auto-extension hook, so this only needs to run once
/// per process).
pub async fn initialize(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let device_id = get_or_create_device_id(pool).await?;

    let max_hlc: Option<String> = sqlx::query("SELECT max(hlc) AS max_hlc FROM sync_cells")
        .fetch_one(pool)
        .await?
        .try_get("max_hlc")
        .ok();

    let wall_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let seed = compute_seed(
        max_hlc.and_then(|value| Hlc::parse(&value).ok()),
        wall_ms,
        device_id,
    );

    SYNC_CLOCK.get_or_init(|| HlcClock::new(seed));

    Ok(())
}

/// Seeds the clock past the highest HLC this device has ever seen (see the
/// module-level invariant docs on `HlcClock`), or from wall time if there is no
/// prior history (fresh database).
fn compute_seed(max_hlc: Option<Hlc>, wall_ms: u64, device_id: DeviceId) -> Hlc {
    let seed = match max_hlc {
        Some(existing) => crate::sync::hlc::tick(&existing, wall_ms),
        None => Hlc::new(wall_ms, 0, device_id),
    };
    Hlc::new(seed.physical_ms, seed.counter, device_id)
}

/// This device's persistent id. Panics if called before `initialize()` has run,
/// which happens as part of `create_sqlite_pool()` — i.e. before any DI-resolved
/// service could observe it.
pub fn device_id() -> DeviceId {
    sync_clock().device_id()
}

/// The process-wide HLC clock. Panics if called before `initialize()` has run —
/// see `device_id()`.
pub fn sync_clock() -> &'static HlcClock {
    SYNC_CLOCK
        .get()
        .expect("sync not initialized: create_sqlite_pool must run before sync engine use")
}

async fn get_or_create_device_id(pool: &SqlitePool) -> Result<DeviceId, sqlx::Error> {
    let existing: Option<String> =
        sqlx::query("SELECT value FROM local_configurations WHERE name = 'sync_device_id'")
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
        "INSERT INTO local_configurations(name, value) VALUES ('sync_device_id', ?1)
         ON CONFLICT(name) DO UPDATE SET value = local_configurations.value",
    )
    .bind(device_id.to_string())
    .execute(pool)
    .await?;

    let device_id: String =
        sqlx::query("SELECT value FROM local_configurations WHERE name = 'sync_device_id'")
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
    async fn initialize_creates_and_persists_device_id() {
        // Arrange

        let pool = create_sqlite_pool("sqlite::memory:").await.unwrap();

        // Act

        initialize(&pool).await.unwrap();
        let device_id: String =
            sqlx::query("SELECT value FROM local_configurations WHERE name = 'sync_device_id'")
                .fetch_one(&pool)
                .await
                .unwrap()
                .try_get("value")
                .unwrap();

        // Assert

        assert!(!device_id.is_empty());
        assert!(device_id.parse::<DeviceId>().is_ok());
    }

    #[tokio::test]
    async fn device_id_sql_function_after_initialize_matches_device_id() {
        // Arrange

        let pool = create_sqlite_pool("sqlite::memory:").await.unwrap();
        initialize(&pool).await.unwrap();

        // Act

        let actual: String = sqlx::query_scalar("SELECT device_id()")
            .fetch_one(&pool)
            .await
            .unwrap();

        // Assert

        assert_eq!(device_id().to_string(), actual);
    }

    #[tokio::test]
    async fn hlc_now_sql_function_after_initialize_returns_monotonically_increasing_hlcs() {
        // Arrange

        let pool = create_sqlite_pool("sqlite::memory:").await.unwrap();
        initialize(&pool).await.unwrap();

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

        let pool = create_sqlite_pool("sqlite::memory:").await.unwrap();

        // Act

        let actual = get_or_create_device_id(&pool).await.unwrap();

        // Assert

        let persisted: String =
            sqlx::query("SELECT value FROM local_configurations WHERE name = 'sync_device_id'")
                .fetch_one(&pool)
                .await
                .unwrap()
                .try_get("value")
                .unwrap();
        assert_eq!(persisted, actual.to_string());
    }

    #[tokio::test]
    async fn get_or_create_device_id_existing_row_returns_same_id_on_second_call() {
        // Arrange

        let pool = create_sqlite_pool("sqlite::memory:").await.unwrap();
        let first = get_or_create_device_id(&pool).await.unwrap();

        // Act

        let second = get_or_create_device_id(&pool).await.unwrap();

        // Assert

        assert_eq!(first, second);
    }
}
