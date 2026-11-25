//! The real engine, schema and HTTP client against a running amber-backend, with a verified account:
//! `AMBER_SYNC_TEST_URL=… AMBER_SYNC_TEST_USER=… AMBER_SYNC_TEST_PASSWORD=… cargo test --features wry live_backend -- --ignored`

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use injector::injector::Injector;
use injector::register_scope;
use reqwest::Url;
use sqlx::Row;
use uuid::Uuid;

use crate::backend::clients::amber_backend_client::AmberBackendClient;
use crate::generated_code::ChangeBatch;
use crate::infrastructure::clients::amber_backend_http_client::AmberBackendHttpClient;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::secrets::repositories::secrets_repository::{SecretsRepository, SecretsRepositoryError};
use crate::sync::bootstrap::register_sync_tables;
use crate::sync::engine::SyncEngine;
use crate::sync::errors::SyncError;
use crate::sync::implementations::default_sync_engine::DefaultSyncEngine;
use crate::sync::store::SyncStore;
use crate::sync::value_objects::sync_outcome::SyncOutcome;
use crate::test_utils::create_file_backed_test_injector;

/// An element as every device should end up seeing it: name, parent and content.
type ElementState = (String, Option<String>, Option<String>);

#[derive(Default)]
struct MemorySecrets(Mutex<HashMap<String, String>>);

#[async_trait]
impl SecretsRepository for MemorySecrets {
    async fn get_secret(&self, key: &str) -> Option<String> {
        self.0.lock().unwrap().get(key).cloned()
    }

    async fn set_secret(&self, key: &str, value: &str) -> Result<(), SecretsRepositoryError> {
        self.0.lock().unwrap().insert(key.into(), value.into());
        Ok(())
    }
}

/// A small xorshift, so a failing run can be replayed from its seed.
struct Random(u64);

impl Random {
    fn below(&mut self, bound: u64) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0 % bound
    }
}

/// One install: its own database and device id, signed in to the shared test account.
#[derive(Clone)]
struct Device {
    injector: Arc<Injector>,
}

impl Device {
    async fn new() -> Self {
        let env = |name: &str| std::env::var(name).unwrap_or_else(|_| panic!("{name} is not set"));
        let url = Url::parse(&env("AMBER_SYNC_TEST_URL")).unwrap();
        let client = AmberBackendHttpClient::new(url, Arc::new(MemorySecrets::default()))
            .await
            .unwrap();
        client
            .sign_in(env("AMBER_SYNC_TEST_USER"), env("AMBER_SYNC_TEST_PASSWORD"))
            .await
            .unwrap();

        let mut injector = create_file_backed_test_injector().await;
        injector.register_singleton::<dyn AmberBackendClient>(Arc::new(client));
        register_scope!(injector, dyn SyncEngine, DefaultSyncEngine);
        let injector = Arc::new(injector);
        register_sync_tables(&injector).await.unwrap();
        Self { injector }
    }

    async fn try_sync(&self) -> Result<SyncOutcome, SyncError> {
        let scope = self.injector.start_scope();
        let outcome = scope.resolve::<dyn SyncEngine>().await.sync().await?;
        scope.save_changes().await.unwrap();
        Ok(outcome)
    }

    async fn sync(&self) -> SyncOutcome {
        self.try_sync().await.unwrap()
    }

    /// Runs `statements` (SQL, binds) in one committed transaction, as a Tauri command does.
    async fn write(&self, statements: &[(&'static str, Vec<String>)]) {
        let scope = self.injector.start_scope();
        {
            let tx = scope.resolve::<DbTransaction>().await;
            let mut guard = tx.lock().await;
            for (sql, binds) in statements {
                let mut query = sqlx::query(*sql);
                for bind in binds {
                    query = query.bind(bind.clone());
                }
                query.execute(guard.as_mut()).await.unwrap();
            }
        }
        scope.save_changes().await.unwrap();
    }

    async fn create_folder(&self, id: &str) {
        self.write(&[
            (
                "INSERT INTO meta(element_id, element_type, name, position, priority)
                 VALUES (?1, 'folder', 'folder', x'80', x'80')",
                vec![id.into()],
            ),
            ("INSERT INTO folders(id) VALUES (?1)", vec![id.into()]),
        ])
        .await;
    }

    async fn create_extract(&self, id: &str, parent: &str, content: &str) {
        self.write(&[
            (
                "INSERT INTO meta(element_id, element_type, name, position, priority, parent_id, parent_type)
                 VALUES (?1, 'extract', ?1, x'80', x'80', ?2, 'folder')",
                vec![id.into(), parent.into()],
            ),
            (
                "INSERT INTO extracts(id, content) VALUES (?1, ?2)",
                vec![id.into(), content.into()],
            ),
        ])
        .await;
    }

    async fn create_extracts(&self, parent: &str, count: usize) -> Vec<String> {
        let ids: Vec<String> = (0..count)
            .map(|_| Uuid::new_v4().hyphenated().to_string())
            .collect();
        let mut statements = Vec::new();
        for id in &ids {
            statements.push((
                "INSERT INTO meta(element_id, element_type, name, position, priority, parent_id, parent_type)
                 VALUES (?1, 'extract', ?1, x'80', x'80', ?2, 'folder')",
                vec![id.clone(), parent.to_string()],
            ));
            statements.push((
                "INSERT INTO extracts(id, content) VALUES (?1, ?2)",
                vec![id.clone(), format!("{{\"text\":\"{id}\"}}")],
            ));
        }
        self.write(&statements).await;
        ids
    }

    async fn rename(&self, id: &str, name: &str) {
        self.write(&[(
            "UPDATE meta SET name = ?2 WHERE element_id = ?1",
            vec![id.into(), name.into()],
        )])
        .await;
    }

    async fn set_content(&self, id: &str, content: &str) {
        self.write(&[(
            "UPDATE extracts SET content = ?2 WHERE id = ?1",
            vec![id.into(), content.into()],
        )])
        .await;
    }

    async fn delete(&self, id: &str) {
        self.write(&[("DELETE FROM meta WHERE element_id = ?1", vec![id.into()])])
            .await;
    }

    /// The state of `ids`, `None` for an absent one.
    async fn snapshot(&self, ids: &[String]) -> BTreeMap<String, Option<ElementState>> {
        let scope = self.injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        let mut snapshot = BTreeMap::new();
        for id in ids {
            let row = sqlx::query(
                "SELECT m.name, m.parent_id, e.content FROM meta m
                 LEFT JOIN extracts e ON e.id = m.element_id WHERE m.element_id = ?1",
            )
            .bind(id)
            .fetch_optional(guard.as_mut())
            .await
            .unwrap();
            let state = row.map(|row| (row.get(0), row.get(1), row.get(2)));
            snapshot.insert(id.clone(), state);
        }
        snapshot
    }

    /// Elements among `ids` with meta but no content, or content but no meta.
    async fn half_applied(&self, ids: &[String]) -> Vec<String> {
        let scope = self.injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        let mut half = Vec::new();
        for id in ids {
            let (meta, content): (bool, bool) = sqlx::query_as(
                "SELECT EXISTS(SELECT 1 FROM meta WHERE element_id = ?1 AND element_type = 'extract'),
                        EXISTS(SELECT 1 FROM extracts WHERE id = ?1)",
            )
            .bind(id)
            .fetch_one(guard.as_mut())
            .await
            .unwrap();
            if meta != content {
                let staged: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM sync_inbox WHERE row_id = json_array(?1)",
                )
                .bind(id)
                .fetch_one(guard.as_mut())
                .await
                .unwrap();
                half.push(format!(
                    "{id} meta={meta} content={content} staged={staged}"
                ));
            }
        }
        half
    }

    /// Starts a sync and drops it after `delay`, unless it finished first.
    async fn abort_sync_after(&self, delay: Duration) {
        let syncing = self.clone();
        let sync = tokio::spawn(async move { syncing.try_sync().await.map(|_| ()) });
        tokio::time::sleep(delay).await;
        sync.abort();
        let _ = sync.await;
    }

    /// Pulls and stages every page as the engine's pull does, applying nothing.
    async fn stage_whole_pull(&self) {
        let scope = self.injector.start_scope();
        let store = scope.resolve::<dyn SyncStore>().await;
        let client = scope.resolve::<dyn AmberBackendClient>().await;
        let mut since = store.get_last_pulled_server_seq().await.unwrap();
        loop {
            let page = client.pull_changes(since).await.unwrap();
            if !page.cells.is_empty() {
                store
                    .stage_remote(ChangeBatch { cells: page.cells })
                    .await
                    .unwrap();
            }
            store
                .set_last_pulled_server_seq(page.next_server_seq)
                .await
                .unwrap();
            since = Some(page.next_server_seq);
            if !page.has_more {
                break;
            }
        }
        scope.save_changes().await.unwrap();
    }

    async fn staged_cells(&self) -> i64 {
        let scope = self.injector.start_scope();
        let tx = scope.resolve::<DbTransaction>().await;
        let mut guard = tx.lock().await;
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_inbox")
            .fetch_one(guard.as_mut())
            .await
            .unwrap()
    }
}

async fn assert_converged(devices: &[&Device], ids: &[String]) {
    let expected = devices[0].snapshot(ids).await;
    for (index, device) in devices.iter().enumerate() {
        assert_eq!(
            Vec::<String>::new(),
            device.half_applied(ids).await,
            "device {index}"
        );
        assert_eq!(0, device.staged_cells().await, "device {index}");
        assert_eq!(expected, device.snapshot(ids).await, "device {index}");
    }
}

fn new_id() -> String {
    Uuid::new_v4().hyphenated().to_string()
}

fn seed() -> u64 {
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
        | 1;
    println!("seed {seed}");
    seed
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_element_created_on_one_device_reaches_another_and_is_reported_changed() {
    // Arrange

    let (a, b) = (Device::new().await, Device::new().await);
    // Caught up first, as the shared account's history is too many rows to list.
    b.sync().await;
    let (folder, extract) = (new_id(), new_id());
    a.create_folder(&folder).await;
    a.create_extract(&extract, &folder, "{\"text\":\"hello\"}")
        .await;
    a.sync().await;

    // Act

    let outcome = b.sync().await;

    // Assert

    let changed = outcome.changed_row_ids.expect("few enough rows to list");
    assert!(changed.contains(&format!("[\"{extract}\"]")));
    assert!(b.snapshot(std::slice::from_ref(&extract)).await[&extract].is_some());
    assert_converged(&[&a, &b], &[folder, extract]).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_same_field_edited_on_both_devices_offline_converges_to_the_later_edit() {
    // Arrange

    let (a, b) = (Device::new().await, Device::new().await);
    let (folder, extract) = (new_id(), new_id());
    a.create_folder(&folder).await;
    a.create_extract(&extract, &folder, "{}").await;
    a.sync().await;
    b.sync().await;
    a.rename(&extract, "from a").await;
    tokio::time::sleep(Duration::from_millis(5)).await;
    b.rename(&extract, "from b").await;

    // Act

    b.sync().await;
    a.sync().await;
    b.sync().await;

    // Assert

    let ids = [folder, extract.clone()];
    assert_converged(&[&a, &b], &ids).await;
    assert_eq!(
        "from b",
        a.snapshot(&ids).await[&extract].as_ref().unwrap().0
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_delete_racing_an_edit_on_another_device_converges() {
    // Arrange

    let (a, b) = (Device::new().await, Device::new().await);
    let folder = new_id();
    a.create_folder(&folder).await;
    let extracts = a.create_extracts(&folder, 4).await;
    a.sync().await;
    b.sync().await;
    // Edits before and after the delete, of the deleted element and of the folder's children.
    b.set_content(&extracts[0], "{\"text\":\"edited before\"}")
        .await;
    a.delete(&extracts[0]).await;
    a.delete(&extracts[1]).await;
    tokio::time::sleep(Duration::from_millis(5)).await;
    b.set_content(&extracts[1], "{\"text\":\"edited after\"}")
        .await;
    b.rename(&extracts[2], "renamed").await;
    a.delete(&folder).await;

    // Act

    let (ra, rb) = tokio::join!(a.try_sync(), b.try_sync());
    ra.unwrap();
    rb.unwrap();
    a.sync().await;
    b.sync().await;

    // Assert

    let mut ids = extracts.clone();
    ids.push(folder);
    assert_converged(&[&a, &b], &ids).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_devices_editing_while_syncing_concurrently_converge() {
    // Arrange

    let mut random = Random(seed());
    let devices = [
        Device::new().await,
        Device::new().await,
        Device::new().await,
    ];
    let folder = new_id();
    devices[0].create_folder(&folder).await;
    let mut ids = devices[0].create_extracts(&folder, 30).await;
    devices[0].sync().await;
    for device in &devices[1..] {
        device.sync().await;
    }

    // Act

    for round in 0..6 {
        let mut tasks = Vec::new();
        for device in &devices {
            let syncing = device.clone();
            tasks.push(tokio::spawn(
                async move { syncing.try_sync().await.map(|_| ()) },
            ));
        }
        // Edits land while the three syncs run.
        for _ in 0..20 {
            let device = &devices[random.below(3) as usize];
            let id = ids[random.below(ids.len() as u64) as usize].clone();
            match random.below(5) {
                0 => {
                    device
                        .rename(&id, &format!("r{round}-{}", random.below(1000)))
                        .await
                }
                1 => {
                    device
                        .set_content(&id, &format!("{{\"v\":{}}}", random.below(1000)))
                        .await
                }
                2 => ids.extend(device.create_extracts(&folder, 3).await),
                3 if random.below(4) == 0 => device.delete(&id).await,
                _ => tokio::time::sleep(Duration::from_millis(random.below(20))).await,
            }
        }
        for task in tasks {
            task.await.unwrap().unwrap();
        }
    }
    for _ in 0..2 {
        for device in &devices {
            device.sync().await;
        }
    }
    let fresh = Device::new().await;
    fresh.sync().await;

    // Assert

    ids.push(folder);
    assert_converged(&[&devices[0], &devices[1], &devices[2], &fresh], &ids).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_large_pull_with_local_writes_between_apply_batches_converges() {
    // Arrange

    let (a, b) = (Device::new().await, Device::new().await);
    let folder = new_id();
    a.create_folder(&folder).await;
    let mut ids = Vec::new();
    for _ in 0..4 {
        ids.extend(a.create_extracts(&folder, 400).await);
    }
    a.sync().await;
    // b already holds the folder, so its own writes during the pull have a parent.
    b.sync().await;
    let more = a.create_extracts(&folder, 800).await;
    a.sync().await;

    // Act

    let syncing = b.clone();
    let sync = tokio::spawn(async move { syncing.try_sync().await.map(|_| ()) });
    let mut own = Vec::new();
    while !sync.is_finished() {
        own.extend(b.create_extracts(&folder, 2).await);
        b.rename(&more[own.len() % more.len()], "renamed during the pull")
            .await;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    sync.await.unwrap().unwrap();
    println!("{} extracts created during the pull", own.len());
    b.sync().await;
    a.sync().await;

    // Assert

    ids.extend(more);
    ids.extend(own);
    ids.push(folder);
    assert_converged(&[&a, &b], &ids).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_interrupted_repeatedly_then_completed_converges() {
    // Arrange

    let mut random = Random(seed());
    let a = Device::new().await;
    let folder = new_id();
    a.create_folder(&folder).await;
    let mut ids = Vec::new();
    for _ in 0..3 {
        ids.extend(a.create_extracts(&folder, 400).await);
    }
    a.sync().await;
    // Rewritten cells move to the end of the pull, away from the rest of their element.
    for id in ids.iter().step_by(3) {
        a.set_content(id, "{\"text\":\"edited\"}").await;
    }
    for id in ids.iter().step_by(5) {
        a.rename(id, "renamed").await;
    }
    a.sync().await;
    let fresh = Device::new().await;

    // Act

    // Aborting drops the sync mid-await, rolling back its open transaction as a crash or quit would.
    for _ in 0..3 {
        fresh
            .abort_sync_after(Duration::from_millis(50 + random.below(200)))
            .await;
        assert_eq!(Vec::<String>::new(), fresh.half_applied(&ids).await);
    }
    // With everything staged, a sync only applies, so these aborts land between apply batches.
    fresh.stage_whole_pull().await;
    let mut apply_interrupts = 0;
    while fresh.staged_cells().await > 0 {
        let before = fresh.staged_cells().await;
        fresh
            .abort_sync_after(Duration::from_millis(random.below(150)))
            .await;
        assert_eq!(Vec::<String>::new(), fresh.half_applied(&ids).await);
        let after = fresh.staged_cells().await;
        if after > 0 && after < before {
            apply_interrupts += 1;
        }
    }
    assert!(apply_interrupts >= 1, "no abort landed while applying");
    fresh.sync().await;

    // Assert

    ids.push(folder);
    assert_converged(&[&a, &fresh], &ids).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs a running amber-backend"]
async fn live_sync_overlapping_syncs_on_one_device_converge() {
    // Arrange

    let (a, b) = (Device::new().await, Device::new().await);
    let folder = new_id();
    a.create_folder(&folder).await;
    let mut ids = a.create_extracts(&folder, 50).await;

    // Act

    let (r1, r2, r3) = tokio::join!(a.try_sync(), a.try_sync(), async {
        ids.extend(a.create_extracts(&folder, 50).await);
        a.try_sync().await
    });
    r1.unwrap();
    r2.unwrap();
    r3.unwrap();
    b.sync().await;

    // Assert

    ids.push(folder);
    assert_converged(&[&a, &b], &ids).await;
}
