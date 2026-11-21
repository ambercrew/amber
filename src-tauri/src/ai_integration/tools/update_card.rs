use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::UPDATE_CARD_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::ai_integration::tools::create_card::card_approval_markdown;
use crate::ai_integration::tools::element_reference::element_reference;
use crate::common::event_manager::EventManager;
use crate::common::repository_error::RepositoryError;
use crate::common::services::lexical_json_converter::{
    LexicalJsonConverter, LexicalJsonConverterError,
};
use crate::elements::dto::update_card_dto::UpdateCardDto;
use crate::elements::events::card_changed_event::emit_card_changed;
use crate::elements::services::element_content_service::ElementContentService;
use crate::elements::value_objects::element_id::ElementId;

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
pub struct UpdateCardArgs {
    #[schemars(description = "The new front of the card (the question or prompt).")]
    pub front: String,
    #[schemars(description = "The new back of the card (the answer).")]
    pub back: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardOutput {
    pub card_id: Uuid,
}

#[derive(Error, Debug)]
pub enum UpdateCardError {
    #[error("The chat has no open card")]
    NoCard,
    #[error("The text must wrap exactly one non-empty part to hide in {{{{ and }}}}")]
    InvalidCloze,
    #[error("Failed to update the card")]
    Update(#[from] RepositoryError),
    #[error("Failed to convert the card content")]
    Conversion(#[from] LexicalJsonConverterError),
}

/// Rewrites the chat's open card in place, shared by `update_card` and `update_cloze_card`. Its review
/// history stays as it is.
pub(in crate::ai_integration) struct CardRewriter {
    element_content_service: Arc<dyn ElementContentService>,
    event_manager: Arc<dyn EventManager>,
    lexical_json_converter: Arc<dyn LexicalJsonConverter>,
    card: Option<Uuid>,
}

impl CardRewriter {
    /// `element` is the chat's open element; the tools are only offered when it's a card.
    pub(in crate::ai_integration) fn new(
        element_content_service: Arc<dyn ElementContentService>,
        event_manager: Arc<dyn EventManager>,
        lexical_json_converter: Arc<dyn LexicalJsonConverter>,
        element: Option<ElementId>,
    ) -> Self {
        Self {
            element_content_service,
            event_manager,
            lexical_json_converter,
            card: match element {
                Some(ElementId::Card(id)) => Some(id),
                _ => None,
            },
        }
    }

    pub(super) fn card(&self) -> Option<Uuid> {
        self.card
    }

    /// Saves the sides (Markdown) and tells an open view to reload it. Leaves its tags, a `leech` one
    /// included, to `clear_leech`.
    pub(super) async fn rewrite(
        &self,
        front_markdown: &str,
        back_markdown: &str,
    ) -> Result<UpdateCardOutput, UpdateCardError> {
        let card_id = self.card.ok_or(UpdateCardError::NoCard)?;
        let (front, back) = tokio::try_join!(
            self.lexical_json_converter.convert_markdown(front_markdown),
            self.lexical_json_converter.convert_markdown(back_markdown),
        )?;

        self.element_content_service
            .update_card(UpdateCardDto {
                id: card_id,
                front,
                back,
            })
            .await?;
        emit_card_changed(self.event_manager.as_ref(), card_id).await;

        Ok(UpdateCardOutput { card_id })
    }

    /// The approval card: what the open card's sides become.
    pub(super) fn approval_markdown(&self, front: &str, back: &str) -> String {
        let card = match self.card {
            Some(id) => element_reference(ElementId::Card(id)),
            None => "the card".to_string(),
        };
        format!(
            "Rewrite {card} as:\n\n{}",
            card_approval_markdown(front, back)
        )
    }
}

/// Markdown added once the rewrite ran.
pub(super) fn card_rewritten_markdown(card_id: Uuid) -> String {
    format!("Rewrote {}", element_reference(ElementId::Card(card_id)))
}

pub struct UpdateCard {
    rewriter: CardRewriter,
}

impl UpdateCard {
    pub(in crate::ai_integration) fn new(rewriter: CardRewriter) -> Self {
        Self { rewriter }
    }
}

impl Tool for UpdateCard {
    const NAME: &'static str = "update_card";

    type Error = UpdateCardError;
    type Args = UpdateCardArgs;
    type Output = UpdateCardOutput;

    fn description(&self) -> String {
        UPDATE_CARD_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(UpdateCardArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        self.rewriter.rewrite(&args.front, &args.back).await
    }
}

impl AppTool for UpdateCard {
    const REQUIRES_APPROVAL: bool = true;

    fn is_applicable(&self, _messages: &[Message]) -> bool {
        self.rewriter.card().is_some()
    }

    fn approval_markdown(&self, args: &Self::Args) -> Option<String> {
        Some(self.rewriter.approval_markdown(&args.front, &args.back))
    }

    fn approved_markdown(&self, _args: &Self::Args, output: &Self::Output) -> Option<String> {
        Some(card_rewritten_markdown(output.card_id))
    }
}

#[cfg(test)]
pub(in crate::ai_integration) mod tests {
    use std::sync::Mutex;

    use async_trait::async_trait;

    use crate::ai_integration::tools::create_card::tests::EchoLexicalJsonConverter;
    use crate::common::event_manager::MockEventManager;
    use crate::elements::dto::update_extract_dto::UpdateExtractDto;
    use crate::elements::dto::update_learning_asset_dto::UpdateLearningAssetDto;
    use crate::elements::events::card_changed_event::CARD_CHANGED_EVENT;

    use super::*;

    /// Records the cards saved and the events pushed, in place of the services.
    #[derive(Default)]
    pub(in crate::ai_integration) struct Recorder {
        pub(in crate::ai_integration::tools) saved: Mutex<Vec<(Uuid, String, String)>>,
        pub(in crate::ai_integration::tools) events: Mutex<Vec<(String, Value)>>,
    }

    pub(in crate::ai_integration) struct RecordingContentService(
        pub(in crate::ai_integration) Arc<Recorder>,
    );

    #[async_trait]
    impl ElementContentService for RecordingContentService {
        async fn update_learning_asset(
            &self,
            _dto: UpdateLearningAssetDto,
        ) -> Result<(), RepositoryError> {
            unimplemented!()
        }
        async fn update_extract(&self, _dto: UpdateExtractDto) -> Result<(), RepositoryError> {
            unimplemented!()
        }
        async fn update_card(&self, dto: UpdateCardDto) -> Result<(), RepositoryError> {
            self.0
                .saved
                .lock()
                .unwrap()
                .push((dto.id, dto.front, dto.back));
            Ok(())
        }
    }

    pub(in crate::ai_integration::tools) fn recording_rewriter(
        element: Option<ElementId>,
    ) -> (CardRewriter, Arc<Recorder>) {
        let recorder = Arc::new(Recorder::default());
        let mut event_manager = MockEventManager::new();
        let events = recorder.clone();
        event_manager.expect_push().returning(move |name, body| {
            events.events.lock().unwrap().push((name.to_string(), body));
            Box::pin(async {})
        });
        let rewriter = CardRewriter::new(
            Arc::new(RecordingContentService(recorder.clone())),
            Arc::new(event_manager),
            Arc::new(EchoLexicalJsonConverter),
            element,
        );
        (rewriter, recorder)
    }

    #[tokio::test]
    async fn call_open_card_saves_sides_and_announces_it() {
        // Arrange

        let card_id = Uuid::new_v4();
        let (rewriter, recorder) = recording_rewriter(Some(ElementId::Card(card_id)));
        let tool = UpdateCard::new(rewriter);
        let args = UpdateCardArgs {
            front: "What is $E$?".into(),
            back: "$mc^2$".into(),
        };

        // Act

        let output = tool.call(&mut ToolContext::default(), args).await.unwrap();

        // Assert

        assert_eq!(UpdateCardOutput { card_id }, output);
        assert_eq!(
            vec![(card_id, "What is $E$?".to_string(), "$mc^2$".to_string())],
            *recorder.saved.lock().unwrap()
        );
        let events = recorder.events.lock().unwrap();
        assert_eq!(CARD_CHANGED_EVENT, events[0].0);
        assert_eq!(card_id.to_string(), events[0].1["cardId"]);
    }

    #[tokio::test]
    async fn call_no_open_card_returns_error_and_saves_nothing() {
        // Arrange

        let (rewriter, recorder) = recording_rewriter(Some(ElementId::Extract(Uuid::new_v4())));
        let tool = UpdateCard::new(rewriter);
        let args = UpdateCardArgs {
            front: "Q".into(),
            back: "A".into(),
        };

        // Act

        let result = tool.call(&mut ToolContext::default(), args).await;

        // Assert

        assert!(matches!(result, Err(UpdateCardError::NoCard)));
        assert!(recorder.saved.lock().unwrap().is_empty());
    }

    #[test]
    fn is_applicable_open_element_kinds_only_offers_it_for_a_card() {
        // Arrange

        let card = UpdateCard::new(recording_rewriter(Some(ElementId::Card(Uuid::new_v4()))).0);
        let extract =
            UpdateCard::new(recording_rewriter(Some(ElementId::Extract(Uuid::new_v4()))).0);
        let none = UpdateCard::new(recording_rewriter(None).0);

        // Act

        let applicable = [card, extract, none].map(|tool| tool.is_applicable(&[]));

        // Assert

        assert_eq!([true, false, false], applicable);
    }

    #[test]
    fn approval_markdown_open_card_names_it_and_shows_new_sides() {
        // Arrange

        let card_id = Uuid::new_v4();
        let tool = UpdateCard::new(recording_rewriter(Some(ElementId::Card(card_id))).0);
        let args = UpdateCardArgs {
            front: "Q".into(),
            back: "A".into(),
        };

        // Act

        let markdown = tool.approval_markdown(&args).unwrap();

        // Assert

        assert_eq!(
            format!(
                "Rewrite {} as:\n\n{}",
                element_reference(ElementId::Card(card_id)),
                card_approval_markdown("Q", "A")
            ),
            markdown
        );
    }
}
