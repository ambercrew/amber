use std::collections::HashSet;

use uuid::Uuid;

use crate::sync::errors::SyncError;
use crate::sync::store::SyncStore;

/// UUID-keyed forms of the trait's key lookups, hyphenated as synced primary keys are.
impl dyn SyncStore {
    pub async fn is_uuid_row_deleted(&self, table: &str, id: Uuid) -> Result<bool, SyncError> {
        self.is_row_deleted(table, &id.hyphenated().to_string())
            .await
    }

    pub async fn deleted_uuid_rows(
        &self,
        table: &str,
        ids: impl IntoIterator<Item = Uuid>,
    ) -> Result<HashSet<Uuid>, SyncError> {
        let keys: Vec<String> = ids
            .into_iter()
            .map(|id| id.hyphenated().to_string())
            .collect();
        let deleted = self.deleted_rows(table, &keys).await?;
        Ok(deleted
            .iter()
            .filter_map(|key| Uuid::parse_str(key).ok())
            .collect())
    }
}
