use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::ai_integration::entities::ai_prompt::AiPrompt;
use crate::ai_integration::repositories::ai_prompt_repository::AiPromptRepository;
use crate::common::repository_error::RepositoryError;
use crate::infrastructure::repositories::sqlite::sqlite_rows::ai_prompt_row::AiPromptRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteAiPromptRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl AiPromptRepository for SqliteAiPromptRepository {
    async fn create(&self, prompt: &AiPrompt) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"INSERT INTO ai_prompts (id, created_at, modified_at, name, content)
            VALUES ($1, datetime($2), datetime($3), $4, $5)"#,
            prompt.id.hyphenated(),
            prompt.created_at,
            prompt.modified_at,
            prompt.name,
            prompt.content,
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn update(&self, prompt: &AiPrompt) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(
            r#"UPDATE ai_prompts SET name = $1, content = $2 WHERE id = $3"#,
            prompt.name,
            prompt.content,
            prompt.id.hyphenated(),
        )
        .execute(&mut *tx)
        .await?;

        Ok(())
    }

    async fn delete(&self, id: Uuid) -> Result<(), RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(r#"DELETE FROM ai_prompts WHERE id = $1"#, id.hyphenated())
            .execute(&mut *tx)
            .await?;

        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<AiPrompt, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            AiPromptRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name,
                content
            FROM ai_prompts
            WHERE id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn get_all(&self) -> Result<Vec<AiPrompt>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            AiPromptRow,
            r#"SELECT
                id as "id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _",
                name,
                content
            FROM ai_prompts
            ORDER BY name COLLATE NOCASE ASC, created_at ASC"#
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(AiPrompt::from).collect())
    }
}
