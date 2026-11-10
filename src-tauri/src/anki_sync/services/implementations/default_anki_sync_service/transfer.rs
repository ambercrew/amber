use std::collections::BTreeMap;
use std::path::PathBuf;

use uuid::Uuid;

use super::DefaultAnkiSyncService;
use crate::anki_sync::anki_connect::{
    AnkiConnectClient, AnkiConnectError, delete_media_file, export_package, has_media_file,
    import_package, media_dir_path, retrieve_media_file, store_media_file,
};
use crate::anki_sync::entities::anki_note::AnkiNote;
use crate::anki_sync::package::writer::{write_package, write_packages};
use crate::anki_sync::services::anki_sync_service::AnkiSyncError;

/// The largest package sent through AnkiConnect, whose requests can't pass 16 MiB once in base64.
pub(super) const SENT_PACKAGE_BYTES: usize = 11 * 1024 * 1024;

/// Packages travel through Anki's media folder, the one place both apps reach even when either is
/// sandboxed (Flatpak, Snap, MSIX): read and written directly when Amber sees it, else over AnkiConnect.
struct MediaFolder {
    /// As Anki sees it, which is also where Amber looks.
    path: PathBuf,
}

impl MediaFolder {
    async fn of(client: &dyn AnkiConnectClient) -> Result<Self, AnkiConnectError> {
        let path = media_dir_path(client).await?;
        Ok(Self { path: path.into() })
    }

    fn path_of(&self, name: &str) -> PathBuf {
        self.path.join(name)
    }

    /// The path in the form AnkiConnect takes.
    fn anki_path_of(&self, name: &str) -> String {
        self.path_of(name).to_string_lossy().into_owned()
    }

    /// Writes the package straight into the folder, true when Anki then sees it there. A sandbox may hide
    /// the folder or keep Amber's write to itself, so Anki is asked rather than trusted to share it.
    async fn write(
        &self,
        client: &dyn AnkiConnectClient,
        name: &str,
        package: &[u8],
    ) -> Result<bool, AnkiConnectError> {
        if tokio::fs::write(self.path_of(name), package).await.is_err() {
            return Ok(false);
        }
        let seen = has_media_file(client, name).await;
        if !matches!(seen, Ok(true)) {
            let _ = tokio::fs::remove_file(self.path_of(name)).await;
        }
        seen
    }

    /// Reads a package Anki wrote, directly when Amber sees it, else over AnkiConnect.
    async fn read(
        &self,
        client: &dyn AnkiConnectClient,
        name: &str,
    ) -> Result<Vec<u8>, AnkiConnectError> {
        if let Ok(package) = tokio::fs::read(self.path_of(name)).await {
            return Ok(package);
        }
        retrieve_media_file(client, name)
            .await?
            .ok_or(AnkiConnectError::InvalidResponse)
    }

    /// A package left behind would reach AnkiWeb with the media, so Anki trashes any Amber couldn't delete.
    async fn remove(
        &self,
        client: &dyn AnkiConnectClient,
        name: &str,
    ) -> Result<(), AnkiConnectError> {
        let _ = tokio::fs::remove_file(self.path_of(name)).await;
        if has_media_file(client, name).await? {
            delete_media_file(client, name).await?;
        }
        Ok(())
    }
}

fn package_name() -> String {
    format!("amber-anki-sync-{}.apkg", Uuid::new_v4())
}

/// Runs `action` on the package named `name`, then removes the package, even when `action` failed.
async fn then_remove<T>(
    folder: &MediaFolder,
    client: &dyn AnkiConnectClient,
    name: &str,
    action: impl Future<Output = Result<T, AnkiConnectError>>,
) -> Result<T, AnkiConnectError> {
    let result = action.await;
    let removed = folder.remove(client, name).await;
    let value = result?;
    removed?;
    Ok(value)
}

impl DefaultAnkiSyncService {
    /// Imports `notes` with Anki's own importer. Sent over AnkiConnect, they go in parts small enough for
    /// one request each.
    pub(super) async fn import_notes(
        &self,
        notes: &[AnkiNote],
        media: &BTreeMap<String, Vec<u8>>,
    ) -> Result<(), AnkiSyncError> {
        let client = self.client();
        let folder = MediaFolder::of(client).await?;
        let name = package_name();
        if folder
            .write(client, &name, &write_package(notes, media)?)
            .await?
        {
            let path = folder.anki_path_of(&name);
            let import = import_package(client, &path);
            return Ok(then_remove(&folder, client, &name, import).await?);
        }
        for package in write_packages(notes, media, SENT_PACKAGE_BYTES)? {
            let name = store_media_file(client, &package_name(), &package).await?;
            let path = folder.anki_path_of(&name);
            let import = import_package(client, &path);
            then_remove(&folder, client, &name, import).await?;
        }
        Ok(())
    }

    pub(super) async fn export_deck(&self, deck: &str) -> Result<Vec<u8>, AnkiSyncError> {
        let client = self.client();
        let folder = MediaFolder::of(client).await?;
        let name = package_name();
        let export = async {
            export_package(client, deck, &folder.anki_path_of(&name)).await?;
            folder.read(client, &name).await
        };
        Ok(then_remove(&folder, client, &name, export).await?)
    }
}

/// Whether `path` names a package the sync made, for tests that check none was left behind.
#[cfg(test)]
pub(super) fn is_package(path: &std::path::Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str());
    name.is_some_and(|name| name.starts_with("amber-anki-sync-") && name.ends_with(".apkg"))
}
