use std::sync::Arc;

use rig::tool::{Tool, ToolContext};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::ai_integration::prompts::CREATE_CLOZE_CARD_DESCRIPTION;
use crate::ai_integration::tools::app_tool::AppTool;
use crate::ai_integration::tools::create_card::{
    CreateCardOutput, card_approval_markdown, card_approved_markdown,
};
use crate::common::services::lexical_json_converter::{
    LexicalJsonConverter, LexicalJsonConverterError,
};
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_meta_dto::CreateMetaDto;
use crate::elements::services::element_creation_service::{
    ElementCreationError, ElementCreationService,
};
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::origin::Origin;

/// What the front shows in place of the hidden part, as the editor's cloze does.
const CLOZE_PLACEHOLDER: &str = "[...]";

#[derive(Deserialize, Debug, Clone, Serialize, schemars::JsonSchema)]
pub struct CreateClozeCardArgs {
    #[schemars(
        description = "The card's text, with exactly one part to hide wrapped in double curly braces, e.g. \"The capital of France is {{Paris}}.\""
    )]
    pub text: String,
}

#[derive(Error, Debug)]
pub enum CreateClozeCardError {
    #[error("The text must wrap exactly one non-empty part to hide in {{{{ and }}}}")]
    InvalidCloze,
    #[error("Failed to create the card")]
    Creation(#[from] ElementCreationError),
    #[error("Failed to convert the card content")]
    Conversion(#[from] LexicalJsonConverterError),
}

/// The text split around its one hidden part.
#[derive(Debug, PartialEq, Eq)]
struct Cloze<'a> {
    before: &'a str,
    hidden: &'a str,
    after: &'a str,
}

impl<'a> Cloze<'a> {
    fn parse(text: &'a str) -> Option<Self> {
        let (before, rest) = text.split_once("{{")?;
        let (hidden, after) = rest.split_once("}}")?;
        let stray_braces = [before, hidden, after]
            .iter()
            .any(|part| part.contains("{{") || part.contains("}}"));
        (!stray_braces && !hidden.trim().is_empty()).then_some(Self {
            before,
            hidden,
            after,
        })
    }

    /// The text with the hidden part replaced by `placeholder`.
    fn with(&self, placeholder: &str) -> String {
        format!("{}{placeholder}{}", self.before, self.after)
    }

    /// The front, hiding the part behind the editor's cloze node so the back can reveal it.
    fn front_markdown(&self) -> String {
        self.with(&format!(
            "<mark data-cloze-hidden=\"{}\">{CLOZE_PLACEHOLDER}</mark>",
            escape_html_attribute(self.hidden)
        ))
    }
}

fn escape_html_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub struct CreateClozeCard {
    element_creation_service: Arc<dyn ElementCreationService>,
    lexical_json_converter: Arc<dyn LexicalJsonConverter>,
    parent: Option<ElementId>,
}

impl CreateClozeCard {
    pub fn new(
        element_creation_service: Arc<dyn ElementCreationService>,
        lexical_json_converter: Arc<dyn LexicalJsonConverter>,
        parent: Option<ElementId>,
    ) -> Self {
        Self {
            element_creation_service,
            lexical_json_converter,
            parent,
        }
    }
}

impl Tool for CreateClozeCard {
    const NAME: &'static str = "create_cloze_card";

    type Error = CreateClozeCardError;
    type Args = CreateClozeCardArgs;
    type Output = CreateCardOutput;

    fn description(&self) -> String {
        CREATE_CLOZE_CARD_DESCRIPTION.to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::to_value(schema_for!(CreateClozeCardArgs)).unwrap()
    }

    async fn call(
        &self,
        _context: &mut ToolContext,
        args: Self::Args,
    ) -> Result<Self::Output, Self::Error> {
        let cloze = Cloze::parse(&args.text).ok_or(CreateClozeCardError::InvalidCloze)?;

        let front_markdown = cloze.front_markdown();
        let (front, back) = tokio::try_join!(
            self.lexical_json_converter
                .convert_markdown(&front_markdown),
            self.lexical_json_converter.convert_markdown(cloze.hidden),
        )?;

        let card_id = Uuid::new_v4();
        let dto = CreateCardDto {
            id: card_id,
            meta: CreateMetaDto {
                name: None,
                parent: self.parent,
                origin: Origin::Inherited,
            },
            front,
            back,
        };

        self.element_creation_service.create_card(dto).await?;

        Ok(CreateCardOutput { card_id })
    }
}

impl AppTool for CreateClozeCard {
    const REQUIRES_APPROVAL: bool = true;

    /// Malformed text falls back to the raw arguments; the call then fails and tells the model why.
    fn approval_markdown(&self, args: &Self::Args) -> Option<String> {
        let cloze = Cloze::parse(&args.text)?;
        Some(card_approval_markdown(
            self.parent,
            &cloze.with(&format!("**{CLOZE_PLACEHOLDER}**")),
            cloze.hidden,
        ))
    }

    fn approved_markdown(&self, _args: &Self::Args, output: &Self::Output) -> Option<String> {
        Some(card_approved_markdown(output.card_id))
    }
}

#[cfg(test)]
mod tests {
    use crate::ai_integration::tools::create_card::tests::{
        EchoLexicalJsonConverter, initialize_test_injector,
    };
    use crate::ai_integration::tools::element_reference::element_reference;
    use crate::elements::repositories::card_repository::CardRepository;

    use super::*;

    fn args(text: &str) -> CreateClozeCardArgs {
        CreateClozeCardArgs {
            text: text.to_string(),
        }
    }

    async fn create_tool(
        scope: &injector::injector_scope::InjectorScope<'_>,
        parent: Option<ElementId>,
    ) -> CreateClozeCard {
        CreateClozeCard::new(
            scope.resolve::<dyn ElementCreationService>().await,
            Arc::new(EchoLexicalJsonConverter),
            parent,
        )
    }

    #[test]
    fn parse_one_hidden_part_split_text_around_it() {
        // Arrange

        let text = "The capital of France is {{Paris}}.";

        // Act

        let actual = Cloze::parse(text);

        // Assert

        assert_eq!(
            Some(Cloze {
                before: "The capital of France is ",
                hidden: "Paris",
                after: ".",
            }),
            actual
        );
    }

    #[test]
    fn parse_no_hidden_part_returned_none() {
        // Arrange

        let text = "The capital of France is Paris.";

        // Act

        let actual = Cloze::parse(text);

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn parse_two_hidden_parts_returned_none() {
        // Arrange

        let text = "{{Paris}} is the capital of {{France}}.";

        // Act

        let actual = Cloze::parse(text);

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn parse_blank_hidden_part_returned_none() {
        // Arrange

        let text = "The capital of France is {{ }}.";

        // Act

        let actual = Cloze::parse(text);

        // Assert

        assert_eq!(None, actual);
    }

    #[test]
    fn front_markdown_hidden_part_with_quotes_escaped_it_in_the_cloze_mark() {
        // Arrange

        let cloze = Cloze::parse("He said {{\"a & b\"}}.").unwrap();

        // Act

        let actual = cloze.front_markdown();

        // Assert

        assert_eq!(
            "He said <mark data-cloze-hidden=\"&quot;a &amp; b&quot;\">[...]</mark>.",
            actual
        );
    }

    #[tokio::test]
    async fn approval_markdown_with_parent_showed_placeholder_front_and_hidden_back() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let parent = ElementId::Folder(Uuid::new_v4());
        let tool = create_tool(&scope, Some(parent)).await;

        // Act

        let actual = tool.approval_markdown(&args("The capital of France is {{Paris}}."));

        // Assert

        assert_eq!(
            Some(format!(
                "In {}\n\n**Front**\n\nThe capital of France is **[...]**.\n\n---\n\n**Back**\n\nParis",
                element_reference(parent)
            )),
            actual
        );
    }

    #[tokio::test]
    async fn approval_markdown_invalid_text_returned_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let tool = create_tool(&scope, None).await;

        // Act

        let actual = tool.approval_markdown(&args("No hidden part"));

        // Assert

        assert_eq!(None, actual);
    }

    #[tokio::test]
    async fn call_valid_text_created_card_hiding_the_part_on_the_front() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let tool = create_tool(&scope, None).await;

        // Act

        let actual = tool
            .call(
                &mut ToolContext::default(),
                args("The capital of France is {{Paris}}."),
            )
            .await
            .unwrap();

        // Assert

        let cards = card_repository.get_all().await.unwrap();
        assert_eq!(1, cards.len());
        assert_eq!(cards[0].meta.element_id.id(), actual.card_id);
        assert_eq!(
            "The capital of France is <mark data-cloze-hidden=\"Paris\">[...]</mark>.",
            cards[0].front
        );
        assert_eq!("Paris", cards[0].back);
    }

    #[tokio::test]
    async fn call_invalid_text_created_no_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let tool = create_tool(&scope, None).await;

        // Act

        let actual = tool
            .call(&mut ToolContext::default(), args("No hidden part"))
            .await;

        // Assert

        assert!(matches!(actual, Err(CreateClozeCardError::InvalidCloze)));
        assert!(card_repository.get_all().await.unwrap().is_empty());
    }
}
