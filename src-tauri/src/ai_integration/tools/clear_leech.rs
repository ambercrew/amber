use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::CLEAR_LEECH_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::ai_integration::tools::element_reference::element_reference;
use crate::common::event_manager::EventManager;
use crate::common::repository_error::RepositoryError;
use crate::elements::events::card_changed_event::emit_card_changed;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingError;
use crate::study::services::leech_service::LeechService;

/// Takes nothing; the tool always acts on the card the chat was opened on.
#[derive(Deserialize, Debug, Clone, Default, Serialize, schemars::JsonSchema)]
pub struct ClearLeechArgs {}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearLeechOutput {
    pub card_id: Uuid,
}

#[derive(Error, Debug)]
pub enum ClearLeechError {
    #[error("The chat has no open leech")]
    NoLeech,
    #[error("Failed to clear the leech")]
    Leech(#[from] LearningAssetSchedulingError),
}

pub struct ClearLeech {
    leech_service: Arc<dyn LeechService>,
    event_manager: Arc<dyn EventManager>,
    /// The open card, when it's tagged `leech`.
    leech: Option<Uuid>,
}

impl ClearLeech {
    /// `element` is the chat's open element; the tool is only offered when it's a card tagged `leech`.
    pub async fn new(
        leech_service: Arc<dyn LeechService>,
        event_manager: Arc<dyn EventManager>,
        element: Option<ElementId>,
    ) -> Result<Self, RepositoryError> {
        let leech = match element {
            Some(ElementId::Card(id)) if leech_service.is_leech(id).await? => Some(id),
            _ => None,
        };
        Ok(Self {
            leech_service,
            event_manager,
            leech,
        })
    }
}

impl Tool for ClearLeech {
    const NAME: &'static str = "clear_leech";

    type Error = ClearLeechError;
    type Args = ClearLeechArgs;
    type Output = ClearLeechOutput;

    fn description(&self) -> String {
        CLEAR_LEECH_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(ClearLeechArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        _args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let card_id = self.leech.ok_or(ClearLeechError::NoLeech)?;
        self.leech_service.clear_leech(card_id).await?;
        emit_card_changed(self.event_manager.as_ref(), card_id).await;
        Ok(ClearLeechOutput { card_id })
    }
}

impl AppTool for ClearLeech {
    const REQUIRES_APPROVAL: bool = true;

    fn is_applicable(&self, _messages: &[Message]) -> bool {
        self.leech.is_some()
    }

    fn approval_markdown(&self, _args: &Self::Args) -> Option<String> {
        Some(match self.leech {
            Some(id) => format!(
                "Remove the leech tag from {}, and resume reviewing it if it's suspended",
                element_reference(ElementId::Card(id))
            ),
            None => "Clear the leech; the card is no longer one".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use async_trait::async_trait;

    use crate::common::event_manager::MockEventManager;
    use crate::elements::events::card_changed_event::CARD_CHANGED_EVENT;

    use super::*;

    /// A leech service whose only leech is `leech`, recording the cards it clears.
    struct FakeLeechService {
        leech: Uuid,
        cleared: Mutex<Vec<Uuid>>,
    }

    #[async_trait]
    impl LeechService for FakeLeechService {
        async fn is_leech(&self, card_id: Uuid) -> Result<bool, RepositoryError> {
            Ok(card_id == self.leech)
        }
        async fn clear_leech(&self, card_id: Uuid) -> Result<(), LearningAssetSchedulingError> {
            self.cleared.lock().unwrap().push(card_id);
            Ok(())
        }
    }

    fn fake_service(leech: Uuid) -> Arc<FakeLeechService> {
        Arc::new(FakeLeechService {
            leech,
            cleared: Mutex::new(Vec::new()),
        })
    }

    fn permissive_event_manager() -> Arc<dyn EventManager> {
        let mut mock = MockEventManager::new();
        mock.expect_push().returning(|_, _| Box::pin(async {}));
        Arc::new(mock)
    }

    #[tokio::test]
    async fn is_applicable_open_elements_only_offers_it_for_a_leech_card() {
        // Arrange

        let leech = Uuid::new_v4();
        let service = fake_service(leech);
        let mut tools = Vec::new();
        for element in [
            Some(ElementId::Card(leech)),
            Some(ElementId::Card(Uuid::new_v4())),
            Some(ElementId::Extract(leech)),
            None,
        ] {
            tools.push(
                ClearLeech::new(service.clone(), permissive_event_manager(), element)
                    .await
                    .unwrap(),
            );
        }

        // Act

        let applicable: Vec<bool> = tools.iter().map(|tool| tool.is_applicable(&[])).collect();

        // Assert

        assert_eq!(vec![true, false, false, false], applicable);
    }

    #[tokio::test]
    async fn call_open_leech_clears_it_and_announces_the_change() {
        // Arrange

        let leech = Uuid::new_v4();
        let service = fake_service(leech);
        let mut event_manager = MockEventManager::new();
        event_manager
            .expect_push()
            .withf(move |name, body| {
                name == CARD_CHANGED_EVENT && body["cardId"] == leech.to_string()
            })
            .times(1)
            .returning(|_, _| Box::pin(async {}));
        let tool = ClearLeech::new(
            service.clone(),
            Arc::new(event_manager),
            Some(ElementId::Card(leech)),
        )
        .await
        .unwrap();

        // Act

        let output = tool
            .call(&mut ToolContext::default(), ClearLeechArgs {})
            .await
            .unwrap();

        // Assert

        assert_eq!(ClearLeechOutput { card_id: leech }, output);
        assert_eq!(vec![leech], *service.cleared.lock().unwrap());
    }
}
