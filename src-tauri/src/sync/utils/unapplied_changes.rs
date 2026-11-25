use injector::injector_scope::InjectorScope;

use crate::sync::store::SyncStore;

/// Whether an interrupted sync left pulled cells in `sync_inbox`, so the data may be half applied until the
/// next sync. Background sweeps skip then, as a half-applied change could make live rows look unreferenced.
pub async fn has_unapplied_remote_changes(scope: &InjectorScope<'_>) -> bool {
    match scope.resolve::<dyn SyncStore>().await.has_staged().await {
        Ok(staged) => staged,
        Err(err) => {
            log::error!("Failed to check for unapplied remote changes: {err:?}");
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::generated_code::{CellChange, ChangeBatch};
    use crate::sync::hlc::{DeviceId, Hlc, wall_time_ms};
    use crate::test_utils::create_test_injector;

    use super::*;

    #[tokio::test]
    async fn has_unapplied_remote_changes_nothing_staged_returns_false() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();

        // Act

        let actual = has_unapplied_remote_changes(&scope).await;

        // Assert

        assert!(!actual);
    }

    #[tokio::test]
    async fn has_unapplied_remote_changes_cells_staged_returns_true() {
        // Arrange

        let injector = create_test_injector().await;
        let scope = injector.start_scope();
        let hlc = Hlc::new(wall_time_ms(), 0, DeviceId::from_name("remote-device"));
        scope
            .resolve::<dyn SyncStore>()
            .await
            .stage_remote(ChangeBatch {
                cells: vec![CellChange {
                    tbl: "notes".to_string(),
                    row_id: r#"["1"]"#.to_string(),
                    col: "title".to_string(),
                    value: None,
                    hlc: hlc.format(),
                    device_id: "remote-device".to_string(),
                }],
            })
            .await
            .unwrap();

        // Act

        let actual = has_unapplied_remote_changes(&scope).await;

        // Assert

        assert!(actual);
    }
}
