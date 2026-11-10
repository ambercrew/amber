use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::folder::Folder;

#[async_trait]
pub trait FolderRepository: Send + Sync {
    #[cfg(test)]
    async fn get_all(&self) -> Result<Vec<Folder>, RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<Folder, RepositoryError>;
    async fn create(&self, folder: Folder) -> Result<(), RepositoryError>;
}
