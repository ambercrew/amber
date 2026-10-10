use async_trait::async_trait;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::card::Card;

#[async_trait]
pub trait CardRepository: Send + Sync {
    async fn get_all(&self) -> Result<Vec<Card>, RepositoryError>;
    async fn get_by_id(&self, id: Uuid) -> Result<Card, RepositoryError>;
    async fn create(&self, card: Card) -> Result<(), RepositoryError>;
    async fn update_content(
        &self,
        id: Uuid,
        front: String,
        back: String,
    ) -> Result<(), RepositoryError>;
    /// Cards whose front or back still embeds a `data:image/` URI.
    async fn find_ids_with_embedded_images(&self) -> Result<Vec<Uuid>, RepositoryError>;
}
