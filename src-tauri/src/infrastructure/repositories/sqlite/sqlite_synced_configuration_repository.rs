use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::{
    common::repository_error::RepositoryError,
    infrastructure::{
        repositories::sqlite::sqlite_rows::local_configuration_row::LocalConfigurationRow,
        value_objects::db_transaction::DbTransaction,
    },
    local_configurations::{
        entities::local_configuration::LocalConfiguration,
        repositories::{
            local_configuration_repository::LocalConfigurationRepository,
            synced_configuration_repository::SyncedConfigurationRepository,
        },
    },
};

#[derive(ScopeInjectable)]
pub struct SqliteSyncedConfigurationRepository {
    tx: Arc<DbTransaction>,
}

impl SyncedConfigurationRepository for SqliteSyncedConfigurationRepository {}

#[async_trait]
impl LocalConfigurationRepository for SqliteSyncedConfigurationRepository {
    async fn get_by_name_raw(
        &self,
        name: &str,
    ) -> Result<Option<LocalConfiguration>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            LocalConfigurationRow,
            r#"SELECT name, value FROM synced_configurations WHERE name = $1"#,
            name
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(row.map(Into::into))
    }

    async fn upsert(&self, configuration: &LocalConfiguration) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        // Only an actual change is written, so an unchanged value doesn't stage a sync cell.
        sqlx::query!(
            r#"INSERT INTO synced_configurations(name, value) VALUES ($1, $2)
            ON CONFLICT(name) DO UPDATE SET value = excluded.value
            WHERE value IS NOT excluded.value"#,
            configuration.name,
            configuration.value
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::local_configurations::repositories::local_configuration_repository::LocalConfigurationRepositoryExt;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(
            injector,
            dyn SyncedConfigurationRepository,
            SqliteSyncedConfigurationRepository
        );
        injector
    }

    #[tokio::test]
    async fn set_by_name_existing_value_replaces_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn SyncedConfigurationRepository>().await;
        repo.set_by_name("FUZZ_FACTOR", &10u8).await.unwrap();

        // Act

        repo.set_by_name("FUZZ_FACTOR", &25u8).await.unwrap();

        // Assert

        let actual = repo.get_by_name::<u8>("FUZZ_FACTOR").await.unwrap();
        assert_eq!(Some(25), actual);
    }
}
