use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};
use serde::Serialize;
use serde::de::DeserializeOwned;
use tauri::Emitter;

use crate::anki_sync::events::anki_sync_progress_event::{
    ANKI_SYNC_PROGRESS_EVENT, AnkiSyncProgressEventDto,
};
use crate::anki_sync::events::replay_card_reviews_event::{
    CardHistoryDto, REPLAY_CARD_REVIEWS_EVENT, ReplayCardReviewsEventDto,
    ReplayCardReviewsResponseDto,
};
use crate::anki_sync::services::sync_frontend::{AnkiSyncStage, SyncFrontend, SyncFrontendError};
use crate::common::request_bridge::{RequestBridge, RequestBridgeError};
use crate::study::entities::card_review::CardReview;

const BATCH_SIZE: usize = 100;
const BATCH_TIMEOUT: Duration = Duration::from_secs(60);

pub struct TauriSyncFrontend<R: tauri::Runtime> {
    bridge: Arc<RequestBridge<R>>,
    app_handle: Arc<tauri::AppHandle<R>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriSyncFrontend<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let bridge = scope.resolve::<RequestBridge<R>>().await;
        let app_handle = scope.resolve::<tauri::AppHandle<R>>().await;
        Self { bridge, app_handle }
    }
}

impl<R: tauri::Runtime> TauriSyncFrontend<R> {
    async fn request<T: Serialize + Send + Clone, U: DeserializeOwned>(
        &self,
        event: &str,
        payload: T,
    ) -> Result<U, SyncFrontendError> {
        let response = self
            .bridge
            .request_with_timeout(event, payload, BATCH_TIMEOUT)
            .await
            .map_err(|err| match err {
                RequestBridgeError::Emit => SyncFrontendError::Emit,
                RequestBridgeError::Timeout => SyncFrontendError::Timeout,
            })?;
        serde_json::from_str(&response).map_err(|_| SyncFrontendError::InvalidResponse)
    }
}

#[async_trait]
impl<R: tauri::Runtime> SyncFrontend for TauriSyncFrontend<R> {
    async fn replay_reviews(
        &self,
        cards: Vec<CardHistoryDto>,
    ) -> Result<Vec<CardReview>, SyncFrontendError> {
        let mut reviews = Vec::with_capacity(cards.len());
        for batch in cards.chunks(BATCH_SIZE) {
            let payload = ReplayCardReviewsEventDto {
                cards: batch.to_vec(),
            };
            match self.request(REPLAY_CARD_REVIEWS_EVENT, payload).await? {
                ReplayCardReviewsResponseDto::Reviews(replayed)
                    if replayed.len() == batch.len() =>
                {
                    reviews.extend(replayed.into_iter().map(CardReview::from))
                }
                ReplayCardReviewsResponseDto::Error(message) => {
                    return Err(SyncFrontendError::Failed(message));
                }
                _ => return Err(SyncFrontendError::InvalidResponse),
            }
        }
        Ok(reviews)
    }

    // Straight to the frontend: the event manager would hold it until the next commit.
    fn report_progress(&self, stage: AnkiSyncStage, current: usize, total: usize) {
        let body = AnkiSyncProgressEventDto {
            stage,
            current,
            total,
        };
        if let Err(error) = self.app_handle.emit(ANKI_SYNC_PROGRESS_EVENT, body) {
            log::warn!("Couldn't report the Anki sync's progress: {error}");
        }
    }
}
