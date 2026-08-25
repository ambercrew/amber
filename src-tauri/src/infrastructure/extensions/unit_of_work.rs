use async_trait::async_trait;
use injector::injector_scope::InjectorScope;

use crate::database::transaction_manager::{TransactionManager, TransactionManagerError};

#[async_trait]
pub trait UnitOfWorkExt {
    async fn save_changes(&self) -> Result<(), TransactionManagerError>;
}

#[async_trait]
impl<'a> UnitOfWorkExt for InjectorScope<'a> {
    async fn save_changes(&self) -> Result<(), TransactionManagerError> {
        log::info!("Saving changes");
        self.resolve::<dyn TransactionManager>()
            .await
            .save_changes()
            .await?;
        log::info!("Changes saved!");
        Ok(())
    }
}
