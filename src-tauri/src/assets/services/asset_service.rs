use async_trait::async_trait;

use crate::assets::entities::asset::Asset;
use crate::assets::value_objects::asset_document::AssetDocument;
use crate::assets::value_objects::asset_id::AssetId;
use crate::common::repository_error::RepositoryError;

/// Days an asset stays unreferenced before a sweep deletes it, covering in-editor
/// undo and cross-device sync lag.
pub const ASSET_GC_GRACE_DAYS: u32 = 14;

#[async_trait]
pub trait AssetService: Send + Sync {
    /// Stores the asset unless it already exists (see `AssetRepository::insert_if_missing`).
    async fn store(&self, asset: &Asset) -> Result<(), RepositoryError>;

    /// Stores the image behind a base64 `data:image/` URI (deduplicated by content)
    /// and returns its id, or `None` when the URI isn't a decodable image.
    async fn create_from_data_uri(
        &self,
        data_uri: &str,
    ) -> Result<Option<AssetId>, RepositoryError>;

    /// Rewrites every embedded-image `src` in a Lexical JSON document to an asset
    /// reference. Content without embedded images is returned untouched.
    async fn ingest_content(&self, content: String) -> Result<String, RepositoryError>;

    async fn find_documents_with_embedded_images(
        &self,
    ) -> Result<Vec<AssetDocument>, RepositoryError>;

    /// Ingests one stored Lexical document's embedded images in place.
    async fn migrate_document(&self, document: AssetDocument) -> Result<(), RepositoryError>;

    async fn sweep_unreferenced(&self) -> Result<u64, RepositoryError>;
}
