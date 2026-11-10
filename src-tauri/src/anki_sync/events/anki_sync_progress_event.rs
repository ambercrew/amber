use serde::Serialize;

use crate::anki_sync::services::sync_frontend::AnkiSyncStage;

pub const ANKI_SYNC_PROGRESS_EVENT: &str = "ankiSyncProgress";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnkiSyncProgressEventDto {
    pub stage: AnkiSyncStage,
    pub current: usize,
    /// 0 when the stage can't be counted.
    pub total: usize,
}
