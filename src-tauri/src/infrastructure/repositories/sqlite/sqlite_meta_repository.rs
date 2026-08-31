use std::sync::Arc;

use async_trait::async_trait;
use fractional_index::FractionalIndex;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::tag::Tag;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::infrastructure::repositories::sqlite::sqlite_rows::meta_row::MetaRow;
use crate::infrastructure::repositories::sqlite::sqlite_rows::tag_row::TagRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;

#[derive(ScopeInjectable)]
pub struct SqliteMetaRepository {
    tx: Arc<DbTransaction>,
}

#[async_trait]
impl MetaRepository for SqliteMetaRepository {
    async fn create_meta(&self, meta: &Meta) -> Result<(), RepositoryError> {
        let uuid = meta.element_id.id().hyphenated();
        let element_type = meta.element_id.element_name();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            "INSERT INTO meta (element_id, element_type, name, position, priority, parent_id, parent_type, derived_from_id, derived_from_type, study_profile_id, bibliographical_source_id, created_at, modified_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, datetime($12), datetime($13))",
            uuid,
            element_type,
            meta.name,
            meta.position.as_bytes(),
            meta.priority.as_bytes(),
            meta.parent.map(|p| p.id().hyphenated()),
            meta.parent.map(|p| p.element_name()),
            meta.derived_from.map(|p| p.id().hyphenated()),
            meta.derived_from.map(|p| p.element_name()),
            meta.study_profile_id.map(|id| id.hyphenated()),
            meta.bibliographical_source_id.map(|id| id.hyphenated()),
            meta.created_at,
            meta.modified_at,
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_by_id(&self, id: Uuid) -> Result<Meta, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE element_id = $1"#,
            id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;

        Ok(row.into())
    }

    async fn delete(&self, id: ElementId) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!(r#"DELETE FROM meta WHERE element_id = $1"#, uuid)
            .execute(&mut *tx)
            .await?;

        Ok(())
    }

    async fn get_tags(&self, id: ElementId) -> Result<Vec<Tag>, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let rows = sqlx::query_as!(
            TagRow,
            r#"SELECT
                t.name,
                t.created_at as "created_at: _",
                t.modified_at as "modified_at: _"
            FROM tags t
            JOIN element_tags et ON et.tag_id = t.name
            WHERE et.element_id = $1
            ORDER BY et.sort_index"#,
            uuid
        )
        .fetch_all(&mut *tx)
        .await?;

        Ok(rows.into_iter().map(Tag::from).collect())
    }

    async fn update_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        sqlx::query!("DELETE FROM element_tags WHERE element_id = $1", uuid)
            .execute(&mut *tx)
            .await?;

        for (sort_index, tag_name) in tags.iter().enumerate() {
            let sort_index = sort_index as i64;

            sqlx::query!("INSERT OR IGNORE INTO tags (name) VALUES ($1)", tag_name,)
                .execute(&mut *tx)
                .await?;

            sqlx::query!(
                "INSERT INTO element_tags (element_id, tag_id, sort_index) VALUES ($1, $2, $3)",
                uuid,
                tag_name,
                sort_index,
            )
            .execute(&mut *tx)
            .await?;
        }

        Ok(())
    }

    async fn add_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        for tag_name in tags {
            sqlx::query!("INSERT OR IGNORE INTO tags (name) VALUES ($1)", tag_name)
                .execute(&mut *tx)
                .await?;

            sqlx::query!(
                r#"INSERT OR IGNORE INTO element_tags (element_id, tag_id, sort_index)
                VALUES ($1, $2, COALESCE(
                    (SELECT MAX(sort_index) + 1 FROM element_tags WHERE element_id = $1),
                    0
                ))"#,
                uuid,
                tag_name,
            )
            .execute(&mut *tx)
            .await?;
        }

        Ok(())
    }

    async fn remove_tags(&self, id: ElementId, tags: Vec<String>) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        for tag_name in tags {
            sqlx::query!(
                "DELETE FROM element_tags WHERE element_id = $1 AND tag_id = $2",
                uuid,
                tag_name,
            )
            .execute(&mut *tx)
            .await?;
        }

        Ok(())
    }

    async fn rename(&self, id: ElementId, new_name: String) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET name = $1 WHERE element_id = $2"#,
            new_name,
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn exists(&self, id: ElementId) -> Result<bool, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT EXISTS(SELECT 1 FROM meta WHERE element_id = $1) as "exists: bool""#,
            uuid
        )
        .fetch_one(&mut *tx)
        .await?;
        Ok(row.exists)
    }

    async fn set_study_profile(
        &self,
        id: ElementId,
        study_profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET study_profile_id = $1 WHERE element_id = $2"#,
            study_profile_id.map(|id| id.hyphenated()),
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn set_bibliographical_source(
        &self,
        id: ElementId,
        bibliographical_source_id: Option<Uuid>,
    ) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET bibliographical_source_id = $1 WHERE element_id = $2"#,
            bibliographical_source_id.map(|id| id.hyphenated()),
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn clear_derived_from(&self, id: ElementId) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET derived_from_id = NULL, derived_from_type = NULL WHERE element_id = $1"#,
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn count_by_bibliographical_source(
        &self,
        bibliographical_source_id: Uuid,
    ) -> Result<i64, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT COUNT(*) as "count: i64" FROM meta WHERE bibliographical_source_id = $1 AND trashed_at IS NULL"#,
            bibliographical_source_id.hyphenated()
        )
        .fetch_one(&mut *tx)
        .await?;
        Ok(row.count)
    }

    async fn move_to(
        &self,
        id: ElementId,
        new_parent: Option<ElementId>,
        new_position: FractionalIndex,
    ) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET parent_id = $1, parent_type = $2, position = $3 WHERE element_id = $4"#,
            new_parent.map(|p| p.id().hyphenated()),
            new_parent.map(|p| p.element_name()),
            new_position.as_bytes(),
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_last_position(
        &self,
        parent: Option<ElementId>,
    ) -> Result<Option<FractionalIndex>, RepositoryError> {
        let parent_id = parent.map(|p| p.id().hyphenated());
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT position as "position: Vec<u8>" FROM meta WHERE parent_id IS $1 AND trashed_at IS NULL ORDER BY position DESC LIMIT 1"#,
            parent_id
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(row.map(|r| FractionalIndex::from_bytes(r.position).expect("Invalid fractional index")))
    }

    async fn get_previous_sibling(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE parent_id IS $1 AND position < $2 AND trashed_at IS NULL
            ORDER BY position DESC
            LIMIT 1"#,
            meta.parent.map(|m| m.id().hyphenated()),
            meta.position.as_bytes()
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn get_next_sibling(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE parent_id IS $1 AND position > $2 AND trashed_at IS NULL
            ORDER BY position
            LIMIT 1"#,
            meta.parent.map(|m| m.id().hyphenated()),
            meta.position.as_bytes()
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn get_children_ordered(
        &self,
        parent: Option<ElementId>,
    ) -> Result<Vec<Meta>, RepositoryError> {
        let parent_id = parent.map(|p| p.id().hyphenated());
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let rows = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE parent_id IS $1 AND trashed_at IS NULL
            ORDER BY position"#,
            parent_id
        )
        .fetch_all(&mut *tx)
        .await?;
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    async fn set_priority(
        &self,
        id: ElementId,
        new_priority: FractionalIndex,
    ) -> Result<(), RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        sqlx::query!(
            r#"UPDATE meta SET priority = $1 WHERE element_id = $2"#,
            new_priority.as_bytes(),
            uuid
        )
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    async fn get_first_priority(&self) -> Result<Option<FractionalIndex>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT priority as "priority: Vec<u8>" FROM meta WHERE trashed_at IS NULL ORDER BY priority LIMIT 1"#
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(row.map(|r| FractionalIndex::from_bytes(r.priority).expect("Invalid fractional index")))
    }

    async fn get_previous_by_priority(&self, meta: &Meta) -> Result<Option<Meta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE priority < $1 AND trashed_at IS NULL
            ORDER BY priority DESC
            LIMIT 1"#,
            meta.priority.as_bytes()
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn get_priority_before(
        &self,
        priority: &FractionalIndex,
    ) -> Result<Option<FractionalIndex>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT priority as "priority: Vec<u8>" FROM meta
            WHERE priority < $1 AND trashed_at IS NULL
            ORDER BY priority DESC
            LIMIT 1"#,
            priority.as_bytes()
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(row.map(|r| FractionalIndex::from_bytes(r.priority).expect("Invalid fractional index")))
    }

    async fn get_priority_after(
        &self,
        priority: &FractionalIndex,
    ) -> Result<Option<FractionalIndex>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT priority as "priority: Vec<u8>" FROM meta
            WHERE priority > $1 AND trashed_at IS NULL
            ORDER BY priority ASC
            LIMIT 1"#,
            priority.as_bytes()
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(row.map(|r| FractionalIndex::from_bytes(r.priority).expect("Invalid fractional index")))
    }

    async fn priority_is_taken(&self, priority: &FractionalIndex) -> Result<bool, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT EXISTS(
                SELECT 1 FROM meta WHERE priority = $1 AND trashed_at IS NULL
            ) as "priority_is_taken: bool""#,
            priority.as_bytes()
        )
        .fetch_one(&mut *tx)
        .await?;
        Ok(row.priority_is_taken)
    }

    async fn get_all_ordered_by_priority(&self) -> Result<Vec<Meta>, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let rows = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE trashed_at IS NULL
            ORDER BY priority"#
        )
        .fetch_all(&mut *tx)
        .await?;
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    async fn get_at_priority_offset(
        &self,
        excluding: Option<ElementId>,
        offset: i64,
    ) -> Result<Option<Meta>, RepositoryError> {
        let uuid = excluding.map(|e| e.id().hyphenated().to_string());
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();

        let row = sqlx::query_as!(
            MetaRow,
            r#"SELECT
                element_id as "element_id: _",
                element_type,
                name,
                position as "position: _",
                priority as "priority: _",
                parent_id as "parent_id: _",
                parent_type,
                derived_from_id as "derived_from_id: _",
                derived_from_type,
                study_profile_id as "study_profile_id: _",
                bibliographical_source_id as "bibliographical_source_id: _",
                created_at as "created_at: _",
                modified_at as "modified_at: _"
            FROM meta
            WHERE (element_id != $1 OR $1 IS NULL) AND trashed_at IS NULL
            ORDER BY priority
            LIMIT 1 OFFSET $2"#,
            uuid,
            offset
        )
        .fetch_optional(&mut *tx)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn count_all(&self) -> Result<i64, RepositoryError> {
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row =
            sqlx::query!(r#"SELECT COUNT(*) as "count: i64" FROM meta WHERE trashed_at IS NULL"#)
                .fetch_one(&mut *tx)
                .await?;
        Ok(row.count)
    }

    async fn count_with_lower_priority(&self, id: ElementId) -> Result<i64, RepositoryError> {
        let uuid = id.id().hyphenated();
        let mut tx = self.tx.lock().await;
        let tx = tx.as_mut();
        let row = sqlx::query!(
            r#"SELECT COUNT(*) as "count: i64" FROM meta
            WHERE trashed_at IS NULL
              AND priority < (SELECT priority FROM meta WHERE element_id = $1)"#,
            uuid
        )
        .fetch_one(&mut *tx)
        .await?;
        Ok(row.count)
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use injector::{injector::Injector, register_scope};

    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        injector
    }

    fn make_meta(id: ElementId) -> Meta {
        Meta {
            element_id: id,
            name: "test".into(),
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            study_profile_id: None,
            bibliographical_source_id: None,
            derived_from: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn add_tags_element_with_existing_tags_merges_new_ones_in() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn MetaRepository>().await;
        let id = ElementId::Folder(Uuid::new_v4());
        repo.create_meta(&make_meta(id)).await.unwrap();
        repo.update_tags(id, vec!["philosophy".into()])
            .await
            .unwrap();

        // Act

        repo.add_tags(id, vec!["history".into(), "philosophy".into()])
            .await
            .unwrap();
        let tags: Vec<String> = repo
            .get_tags(id)
            .await
            .unwrap()
            .into_iter()
            .map(|t| t.name)
            .collect();

        // Assert

        assert_eq!(vec!["philosophy".to_string(), "history".to_string()], tags);
    }

    #[tokio::test]
    async fn remove_tags_existing_tag_removes_only_that_tag() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn MetaRepository>().await;
        let id = ElementId::Folder(Uuid::new_v4());
        repo.create_meta(&make_meta(id)).await.unwrap();
        repo.update_tags(id, vec!["philosophy".into(), "history".into()])
            .await
            .unwrap();

        // Act

        repo.remove_tags(id, vec!["philosophy".into()])
            .await
            .unwrap();
        let tags: Vec<String> = repo
            .get_tags(id)
            .await
            .unwrap()
            .into_iter()
            .map(|t| t.name)
            .collect();

        // Assert

        assert_eq!(vec!["history".to_string()], tags);
    }
}
