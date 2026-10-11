use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector::injector_scope::{InjectorScope, ScopeInjectable};

use crate::common::request_bridge::{RequestBridge, RequestBridgeError};
use crate::image_occlusion::entities::image_occlusion::ImageOcclusion;
use crate::image_occlusion::events::build_occlusion_card_contents_event::{
    BUILD_OCCLUSION_CARD_CONTENTS_EVENT, BuildOcclusionCardContentsEventDto,
};
use crate::image_occlusion::services::occlusion_card_content_builder::{
    OcclusionCardContentBuilder, OcclusionCardContentBuilderError,
};
use crate::image_occlusion::value_objects::occlusion_card_content::OcclusionCardContent;

pub struct TauriOcclusionCardContentBuilder<R: tauri::Runtime> {
    bridge: Arc<RequestBridge<R>>,
}

#[async_trait]
impl<R: tauri::Runtime> ScopeInjectable for TauriOcclusionCardContentBuilder<R> {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self {
        let bridge = scope.resolve::<RequestBridge<R>>().await;
        Self { bridge }
    }
}

#[async_trait]
impl<R: tauri::Runtime> OcclusionCardContentBuilder for TauriOcclusionCardContentBuilder<R> {
    async fn build(
        &self,
        occlusion: &ImageOcclusion,
        target_keys: &[String],
    ) -> Result<HashMap<String, OcclusionCardContent>, OcclusionCardContentBuilderError> {
        let response = self
            .bridge
            .request(
                BUILD_OCCLUSION_CARD_CONTENTS_EVENT,
                BuildOcclusionCardContentsEventDto {
                    occlusion_id: occlusion.id,
                    src: occlusion.image_asset_id.src(),
                    alt_text: occlusion.name.clone(),
                    target_keys: target_keys.to_vec(),
                },
            )
            .await
            .map_err(|err| match err {
                RequestBridgeError::Emit => OcclusionCardContentBuilderError::Emit,
                RequestBridgeError::Timeout => OcclusionCardContentBuilderError::Timeout,
            })?;

        let contents: HashMap<String, OcclusionCardContent> = serde_json::from_str(&response)
            .map_err(|_| OcclusionCardContentBuilderError::InvalidResponse)?;
        if target_keys.iter().all(|key| contents.contains_key(key)) {
            Ok(contents)
        } else {
            Err(OcclusionCardContentBuilderError::InvalidResponse)
        }
    }
}

#[cfg(test)]
mod tests {
    use tauri::Listener;
    use uuid::Uuid;

    use crate::assets::value_objects::asset_id::AssetId;
    use crate::image_occlusion::value_objects::occlusion_mode::OcclusionMode;

    use super::*;

    fn occlusion() -> ImageOcclusion {
        ImageOcclusion {
            id: Uuid::new_v4(),
            name: "Heart".to_string(),
            image_asset_id: AssetId::from_bytes(b"image"),
            image_width: 10,
            image_height: 10,
            shapes: vec![],
            mode: OcclusionMode::HideAllGuessOne,
            parent_id: None,
        }
    }

    /// A builder whose frontend answers every request with `response`.
    fn builder_answering(
        response: &'static str,
    ) -> TauriOcclusionCardContentBuilder<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        let bridge = Arc::new(RequestBridge::new(Arc::new(app.handle().clone())));
        let resolving_bridge = bridge.clone();
        app.listen(BUILD_OCCLUSION_CARD_CONTENTS_EVENT, move |event| {
            let envelope: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
            let request_id: Uuid = serde_json::from_value(envelope["requestId"].clone()).unwrap();
            resolving_bridge.resolve(request_id, response.to_string());
        });
        TauriOcclusionCardContentBuilder { bridge }
    }

    #[tokio::test]
    async fn build_frontend_answers_every_key_returns_contents() {
        // Arrange

        let builder = builder_answering(r#"{"a":{"front":"f","back":"b"}}"#);

        // Act

        let actual = builder
            .build(&occlusion(), &["a".to_string()])
            .await
            .unwrap();

        // Assert

        assert_eq!(
            Some(&OcclusionCardContent {
                front: "f".to_string(),
                back: "b".to_string(),
            }),
            actual.get("a")
        );
    }

    #[tokio::test]
    async fn build_frontend_omits_a_key_returns_invalid_response() {
        // Arrange

        let builder = builder_answering(r#"{"a":{"front":"f","back":"b"}}"#);

        // Act

        let actual = builder
            .build(&occlusion(), &["a".to_string(), "b".to_string()])
            .await;

        // Assert

        assert!(matches!(
            actual,
            Err(OcclusionCardContentBuilderError::InvalidResponse)
        ));
    }
}
