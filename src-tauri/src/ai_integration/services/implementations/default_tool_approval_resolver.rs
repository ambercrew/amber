use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use rig::tool::ToolContext;
use uuid::Uuid;

use crate::ai_integration::entities::message::{
    ApprovalStatus, Message, MessageContent, ToolApproval, ToolCallContent,
};
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::tool_approval_resolver::{
    ToolApprovalResolver, ToolApprovalResolverError,
};
use crate::ai_integration::services::tools_provider::ToolsProvider;
use crate::ai_integration::tools::app_tools::ApprovalMarkdown;

#[derive(ScopeInjectable)]
pub struct DefaultToolApprovalResolver {
    ai_repository: Arc<dyn AiRepository>,
    tools_provider: Arc<dyn ToolsProvider>,
}

#[async_trait]
impl ToolApprovalResolver for DefaultToolApprovalResolver {
    async fn resolve(
        &self,
        message_id: Uuid,
        approved: bool,
    ) -> Result<Message, ToolApprovalResolverError> {
        let mut message = self.ai_repository.get_message_by_id(message_id).await?;

        let MessageContent::ToolCall(ToolCallContent {
            name,
            arguments,
            approval: Some(approval),
            ..
        }) = message.content_mut()
        else {
            return Err(ToolApprovalResolverError::NotAwaitingApproval);
        };
        if approval.status != ApprovalStatus::Pending {
            return Err(ToolApprovalResolverError::AlreadyResolved);
        }

        *approval = if approved {
            let tools = self
                .tools_provider
                .get_tools(&approval.context)
                .await?
                .into_tool_set();
            let result = tools
                .execute(name, arguments.to_string(), &mut ToolContext::default())
                .await;
            if let Some(error) = result.error().or(result.refusal()) {
                return Err(ToolApprovalResolverError::ToolFailed(
                    error.message().to_string(),
                ));
            }

            ToolApproval {
                status: ApprovalStatus::Approved,
                output: Some(result.output().render()),
                ..approval.clone()
            }
        } else {
            ToolApproval {
                status: ApprovalStatus::Rejected,
                ..approval.clone()
            }
        };

        self.ai_repository.upsert_message(&message).await?;

        Ok(message)
    }

    async fn approval_markdown(
        &self,
        tool_call: &ToolCallContent,
    ) -> Result<Option<ApprovalMarkdown>, ToolApprovalResolverError> {
        let Some(approval) = &tool_call.approval else {
            return Ok(None);
        };
        let output = match approval.status {
            ApprovalStatus::Approved => approval.output.as_deref(),
            _ => None,
        };
        Ok(self
            .tools_provider
            .get_tools(&approval.context)
            .await?
            .approval_markdown(&tool_call.name, &tool_call.arguments, output))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use injector::{injector::Injector, register_scope};
    use rig::tool::Tool;
    use serde::Deserialize;
    use serde_json::{Value, json};
    use thiserror::Error;

    use crate::{
        ai_integration::{
            entities::chat::Chat,
            services::tools_provider::ToolsProviderError,
            tools::{app_tool::AppTool, app_tools::AppTools},
        },
        elements::value_objects::element_id::ElementId,
        infrastructure::repositories::sqlite::sqlite_ai_repository::SqliteAiRepository,
        test_utils::create_test_injector,
    };

    use super::*;

    const TOOL_NAME: &str = "test_tool";

    type Runs = Arc<Mutex<Vec<Value>>>;

    #[derive(Deserialize)]
    struct TestToolArgs {
        fail: bool,
    }

    #[derive(Error, Debug)]
    #[error("The test tool failed")]
    struct TestToolError;

    /// Records the context of each run, failing when its arguments ask it to.
    struct TestTool {
        context: Value,
        runs: Runs,
    }

    impl Tool for TestTool {
        const NAME: &'static str = TOOL_NAME;

        type Error = TestToolError;
        type Args = TestToolArgs;
        type Output = String;

        fn description(&self) -> String {
            String::new()
        }

        fn parameters(&self) -> Value {
            json!({})
        }

        async fn call(
            &self,
            _context: &mut ToolContext,
            args: Self::Args,
        ) -> Result<Self::Output, Self::Error> {
            if args.fail {
                return Err(TestToolError);
            }
            self.runs.lock().unwrap().push(self.context.clone());
            Ok("Done.".to_string())
        }
    }

    impl AppTool for TestTool {
        const REQUIRES_APPROVAL: bool = true;

        fn approval_markdown(&self, args: &Self::Args) -> Option<String> {
            Some(format!("Run with {} (fail: {})", self.context, args.fail))
        }

        fn approved_markdown(&self, _args: &Self::Args, output: &Self::Output) -> Option<String> {
            Some(format!("It said: {output}"))
        }
    }

    struct TestToolsProvider {
        runs: Runs,
    }

    #[async_trait]
    impl ToolsProvider for TestToolsProvider {
        fn capture_context(&self, _chat_id: Uuid, _element_id: Option<ElementId>) -> Value {
            Value::Null
        }

        async fn get_tools(&self, context: &Value) -> Result<AppTools, ToolsProviderError> {
            Ok(AppTools::default().tool(TestTool {
                context: context.clone(),
                runs: self.runs.clone(),
            }))
        }
    }

    async fn initialize_test_injector(runs: Runs) -> Injector {
        let mut injector = create_test_injector().await;

        injector.register_singleton::<dyn ToolsProvider>(Arc::new(TestToolsProvider { runs }));
        register_scope!(injector, dyn AiRepository, SqliteAiRepository);
        register_scope!(
            injector,
            dyn ToolApprovalResolver,
            DefaultToolApprovalResolver
        );

        injector
    }

    async fn insert_tool_call(
        ai_repository: &Arc<dyn AiRepository>,
        arguments: Value,
        approval: ToolApproval,
    ) -> Uuid {
        let chat = Chat::new(None, "Chat".to_string());
        ai_repository.upsert_chat(&chat).await.unwrap();

        let message = Message::new(
            None,
            chat.id(),
            MessageContent::ToolCall(ToolCallContent {
                id: "tc-1".to_string(),
                name: TOOL_NAME.to_string(),
                arguments,
                approval: Some(approval),
            }),
        );
        ai_repository.upsert_message(&message).await.unwrap();
        message.id()
    }

    fn approval(message: &Message) -> ToolApproval {
        match message.content() {
            MessageContent::ToolCall(ToolCallContent {
                approval: Some(approval),
                ..
            }) => approval.clone(),
            other => panic!("Expected a tool call awaiting approval, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn resolve_approved_pending_call_ran_tool_with_its_context_and_recorded_output() {
        // Arrange

        let runs = Runs::default();
        let injector = initialize_test_injector(runs.clone()).await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let context = json!({ "elementId": "element-1" });
        let message_id = insert_tool_call(
            &ai_repository,
            json!({ "fail": false }),
            ToolApproval::pending(context.clone()),
        )
        .await;

        // Act

        let actual = resolver.resolve(message_id, true).await.unwrap();

        // Assert

        let expected = ToolApproval {
            context: context.clone(),
            status: ApprovalStatus::Approved,
            output: Some("Done.".to_string()),
        };
        assert_eq!(expected, approval(&actual));
        let persisted = ai_repository.get_message_by_id(message_id).await.unwrap();
        assert_eq!(expected, approval(&persisted));
        assert_eq!(vec![context], *runs.lock().unwrap());
    }

    #[tokio::test]
    async fn resolve_rejected_pending_call_marked_rejected_without_running_tool() {
        // Arrange

        let runs = Runs::default();
        let injector = initialize_test_injector(runs.clone()).await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let message_id = insert_tool_call(
            &ai_repository,
            json!({ "fail": false }),
            ToolApproval::pending(Value::Null),
        )
        .await;

        // Act

        let actual = resolver.resolve(message_id, false).await.unwrap();

        // Assert

        assert_eq!(ApprovalStatus::Rejected, approval(&actual).status);
        assert!(runs.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn resolve_approved_call_whose_tool_failed_returned_error_and_stayed_pending() {
        // Arrange

        let injector = initialize_test_injector(Runs::default()).await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let message_id = insert_tool_call(
            &ai_repository,
            json!({ "fail": true }),
            ToolApproval::pending(Value::Null),
        )
        .await;

        // Act

        let actual = resolver.resolve(message_id, true).await;

        // Assert

        assert!(matches!(
            actual,
            Err(ToolApprovalResolverError::ToolFailed(_))
        ));
        let persisted = ai_repository.get_message_by_id(message_id).await.unwrap();
        assert_eq!(ApprovalStatus::Pending, approval(&persisted).status);
    }

    #[tokio::test]
    async fn resolve_already_resolved_call_returned_already_resolved_error() {
        // Arrange

        let runs = Runs::default();
        let injector = initialize_test_injector(runs.clone()).await;
        let scope = injector.start_scope();
        let ai_repository = scope.resolve::<dyn AiRepository>().await;
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let message_id = insert_tool_call(
            &ai_repository,
            json!({ "fail": false }),
            ToolApproval {
                status: ApprovalStatus::Rejected,
                ..ToolApproval::pending(Value::Null)
            },
        )
        .await;

        // Act

        let actual = resolver.resolve(message_id, true).await;

        // Assert

        assert!(matches!(
            actual,
            Err(ToolApprovalResolverError::AlreadyResolved)
        ));
        assert!(runs.lock().unwrap().is_empty());
    }

    fn tool_call(approval: Option<ToolApproval>) -> ToolCallContent {
        ToolCallContent {
            id: "tc-1".to_string(),
            name: TOOL_NAME.to_string(),
            arguments: json!({ "fail": false }),
            approval,
        }
    }

    #[tokio::test]
    async fn approval_markdown_call_awaiting_approval_written_by_tool_built_from_saved_context() {
        // Arrange

        let injector = initialize_test_injector(Runs::default()).await;
        let scope = injector.start_scope();
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let call = tool_call(Some(ToolApproval::pending(
            json!({ "elementId": "element-1" }),
        )));

        // Act

        let actual = resolver.approval_markdown(&call).await.unwrap();

        // Assert

        assert_eq!(
            Some(ApprovalMarkdown {
                request: r#"Run with {"elementId":"element-1"} (fail: false)"#.to_string(),
                result: None,
            }),
            actual
        );
    }

    #[tokio::test]
    async fn approval_markdown_approved_call_added_result_written_from_its_output() {
        // Arrange

        let injector = initialize_test_injector(Runs::default()).await;
        let scope = injector.start_scope();
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        let call = tool_call(Some(ToolApproval {
            status: ApprovalStatus::Approved,
            output: Some("Done.".to_string()),
            ..ToolApproval::pending(Value::Null)
        }));

        // Act

        let actual = resolver.approval_markdown(&call).await.unwrap();

        // Assert

        assert_eq!(
            Some("It said: Done.".to_string()),
            actual.and_then(|markdown| markdown.result)
        );
    }

    #[tokio::test]
    async fn approval_markdown_call_without_approval_returned_none() {
        // Arrange

        let injector = initialize_test_injector(Runs::default()).await;
        let scope = injector.start_scope();
        let resolver = scope.resolve::<dyn ToolApprovalResolver>().await;

        // Act

        let actual = resolver.approval_markdown(&tool_call(None)).await.unwrap();

        // Assert

        assert_eq!(None, actual);
    }
}
