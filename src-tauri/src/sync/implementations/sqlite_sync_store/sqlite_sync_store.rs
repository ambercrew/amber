use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use super::pending_buffer::PendingBuffer;
use super::{apply, push_pull, register};
use crate::generated_code::ChangeBatch;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::store::SyncStore;
use crate::sync::value_objects::granularity::Granularity;

#[derive(ScopeInjectable)]
pub struct SqliteSyncStore {
    tx: Arc<DbTransaction>,
    pending: Arc<PendingBuffer>,
}

#[async_trait]
impl SyncStore for SqliteSyncStore {
    // TODO: review all methods continue here
    async fn register_table(&self, table: &str, granularity: Granularity) -> Result<(), SyncError> {
        let mut guard = self.tx.lock().await;
        register::register_table(guard.as_mut(), table, granularity).await
    }

    async fn changes_since_last_push(&self) -> Result<ChangeBatch, SyncError> {
        let mut guard = self.tx.lock().await;
        push_pull::changes_since_last_push(guard.as_mut()).await
    }

    async fn mark_pushed(&self, up_to_hlc: &Hlc) -> Result<(), SyncError> {
        let mut guard = self.tx.lock().await;
        push_pull::mark_pushed(guard.as_mut(), up_to_hlc).await
    }

    async fn get_last_pulled_server_seq(&self) -> Result<Option<i64>, SyncError> {
        let mut guard = self.tx.lock().await;
        push_pull::get_last_pulled_server_seq(guard.as_mut()).await
    }

    async fn set_last_pulled_server_seq(&self, seq: i64) -> Result<(), SyncError> {
        let mut guard = self.tx.lock().await;
        push_pull::set_last_pulled_server_seq(guard.as_mut(), seq).await
    }

    async fn apply_remote(&self, batch: ChangeBatch, is_last_page: bool) -> Result<(), SyncError> {
        let mut guard = self.tx.lock().await;
        apply::apply_remote(guard.as_mut(), batch, is_last_page, &self.pending).await
    }

    async fn has_pending_changes(&self) -> Result<bool, SyncError> {
        let mut guard = self.tx.lock().await;
        apply::try_flush_pending(guard.as_mut(), &self.pending).await
    }
}
