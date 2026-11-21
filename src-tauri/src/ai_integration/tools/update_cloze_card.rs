use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ai_integration::entities::message::Message;
use crate::ai_integration::prompts::UPDATE_CLOZE_CARD_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::ai_integration::tools::create_cloze_card::{CLOZE_PLACEHOLDER, Cloze};
use crate::ai_integration::tools::update_card::{
    CardRewriter, UpdateCardError, UpdateCardOutput, card_rewritten_markdown,
};

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
pub struct UpdateClozeCardArgs {
    #[schemars(
        description = "The card's new text, with exactly one part to hide wrapped in double curly braces, e.g. \"The capital of France is {{Paris}}.\""
    )]
    pub text: String,
}

pub struct UpdateClozeCard {
    rewriter: CardRewriter,
}

impl UpdateClozeCard {
    pub(in crate::ai_integration) fn new(rewriter: CardRewriter) -> Self {
        Self { rewriter }
    }
}

impl Tool for UpdateClozeCard {
    const NAME: &'static str = "update_cloze_card";

    type Error = UpdateCardError;
    type Args = UpdateClozeCardArgs;
    type Output = UpdateCardOutput;

    fn description(&self) -> String {
        UPDATE_CLOZE_CARD_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(UpdateClozeCardArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let cloze = Cloze::parse(&args.text).ok_or(UpdateCardError::InvalidCloze)?;
        self.rewriter
            .rewrite(&cloze.front_markdown(), cloze.hidden)
            .await
    }
}

impl AppTool for UpdateClozeCard {
    const REQUIRES_APPROVAL: bool = true;

    fn is_applicable(&self, _messages: &[Message]) -> bool {
        self.rewriter.card().is_some()
    }

    /// Malformed text falls back to the raw arguments; the call then fails and tells the model why.
    fn approval_markdown(&self, args: &Self::Args) -> Option<String> {
        let cloze = Cloze::parse(&args.text)?;
        Some(self.rewriter.approval_markdown(
            &cloze.with(&format!("**{CLOZE_PLACEHOLDER}**")),
            cloze.hidden,
        ))
    }

    fn approved_markdown(&self, _args: &Self::Args, output: &Self::Output) -> Option<String> {
        Some(card_rewritten_markdown(output.card_id))
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use crate::ai_integration::tools::update_card::tests::recording_rewriter;
    use crate::elements::value_objects::element_id::ElementId;

    use super::*;

    #[tokio::test]
    async fn call_valid_cloze_saves_hidden_front_and_hidden_part_as_back() {
        // Arrange

        let card_id = Uuid::new_v4();
        let (rewriter, recorder) = recording_rewriter(Some(ElementId::Card(card_id)));
        let tool = UpdateClozeCard::new(rewriter);
        let args = UpdateClozeCardArgs {
            text: "The capital of France is {{Paris}}.".into(),
        };

        // Act

        tool.call(&mut ToolContext::default(), args).await.unwrap();

        // Assert

        let saved = recorder.saved.lock().unwrap();
        assert_eq!(
            "The capital of France is <mark data-cloze-hidden=\"Paris\">[...]</mark>.",
            saved[0].1
        );
        assert_eq!("Paris", saved[0].2);
    }

    #[tokio::test]
    async fn call_text_without_hidden_part_returns_error_and_saves_nothing() {
        // Arrange

        let (rewriter, recorder) = recording_rewriter(Some(ElementId::Card(Uuid::new_v4())));
        let tool = UpdateClozeCard::new(rewriter);
        let args = UpdateClozeCardArgs {
            text: "No hidden part".into(),
        };

        // Act

        let result = tool.call(&mut ToolContext::default(), args).await;

        // Assert

        assert!(matches!(result, Err(UpdateCardError::InvalidCloze)));
        assert!(recorder.saved.lock().unwrap().is_empty());
    }
}
