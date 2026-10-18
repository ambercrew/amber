use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::ai_integration::entities::ai_prompt::AiPrompt;
use crate::ai_integration::repositories::ai_prompt_repository::AiPromptRepository;
use crate::ai_integration::services::ai_prompt_service::{AiPromptError, AiPromptService};

#[derive(ScopeInjectable)]
pub struct DefaultAiPromptService {
    ai_prompt_repository: Arc<dyn AiPromptRepository>,
}

#[async_trait]
impl AiPromptService for DefaultAiPromptService {
    async fn list_prompts(&self) -> Result<Vec<AiPrompt>, AiPromptError> {
        Ok(self.ai_prompt_repository.get_all().await?)
    }

    async fn create_prompt(
        &self,
        name: String,
        content: String,
    ) -> Result<AiPrompt, AiPromptError> {
        let (name, content) = trimmed(&name, &content)?;
        let now = Utc::now();
        let prompt = AiPrompt {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name,
            content,
        };
        self.ai_prompt_repository.create(&prompt).await?;
        Ok(prompt)
    }

    async fn update_prompt(
        &self,
        id: Uuid,
        name: String,
        content: String,
    ) -> Result<AiPrompt, AiPromptError> {
        let (name, content) = trimmed(&name, &content)?;
        let existing = self.ai_prompt_repository.get_by_id(id).await?;
        let prompt = AiPrompt {
            name,
            content,
            ..existing
        };
        self.ai_prompt_repository.update(&prompt).await?;
        Ok(prompt)
    }

    async fn delete_prompt(&self, id: Uuid) -> Result<(), AiPromptError> {
        Ok(self.ai_prompt_repository.delete(id).await?)
    }
}

fn trimmed(name: &str, content: &str) -> Result<(String, String), AiPromptError> {
    let (name, content) = (name.trim(), content.trim());
    if name.is_empty() || content.is_empty() {
        return Err(AiPromptError::Empty);
    }
    Ok((name.to_string(), content.to_string()))
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::infrastructure::repositories::sqlite::sqlite_ai_prompt_repository::SqliteAiPromptRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn AiPromptRepository, SqliteAiPromptRepository);
        register_scope!(injector, dyn AiPromptService, DefaultAiPromptService);
        injector
    }

    #[tokio::test]
    async fn create_prompt_padded_name_and_content_saved_them_trimmed() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiPromptService>().await;

        // Act

        let created = service
            .create_prompt("  Summarize ".into(), "\nSummarize this.  ".into())
            .await
            .unwrap();

        // Assert

        let prompts = service.list_prompts().await.unwrap();
        assert_eq!(1, prompts.len());
        assert_eq!(created.id, prompts[0].id);
        assert_eq!("Summarize", prompts[0].name);
        assert_eq!("Summarize this.", prompts[0].content);
    }

    #[tokio::test]
    async fn create_prompt_blank_content_refused_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiPromptService>().await;

        // Act

        let actual = service.create_prompt("Summarize".into(), "  ".into()).await;

        // Assert

        assert!(matches!(actual, Err(AiPromptError::Empty)));
        assert!(service.list_prompts().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn list_prompts_several_prompts_ordered_them_by_name_ignoring_case() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiPromptService>().await;
        for name in ["quiz me", "Explain", "Bullet points"] {
            service
                .create_prompt(name.into(), "Text".into())
                .await
                .unwrap();
        }

        // Act

        let actual = service.list_prompts().await.unwrap();

        // Assert

        let names: Vec<_> = actual.iter().map(|prompt| prompt.name.as_str()).collect();
        assert_eq!(vec!["Bullet points", "Explain", "quiz me"], names);
    }

    #[tokio::test]
    async fn update_prompt_existing_prompt_changed_name_and_content() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiPromptService>().await;
        let prompt = service
            .create_prompt("Old".into(), "Old text".into())
            .await
            .unwrap();

        // Act

        service
            .update_prompt(prompt.id, "New".into(), "New text".into())
            .await
            .unwrap();

        // Assert

        let actual = service.list_prompts().await.unwrap();
        assert_eq!(1, actual.len());
        assert_eq!("New", actual[0].name);
        assert_eq!("New text", actual[0].content);
    }

    #[tokio::test]
    async fn delete_prompt_existing_prompt_removed_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn AiPromptService>().await;
        let prompt = service
            .create_prompt("Summarize".into(), "Summarize this.".into())
            .await
            .unwrap();

        // Act

        service.delete_prompt(prompt.id).await.unwrap();

        // Assert

        assert!(service.list_prompts().await.unwrap().is_empty());
    }
}
