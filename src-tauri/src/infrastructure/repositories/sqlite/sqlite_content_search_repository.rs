use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use sqlx::{QueryBuilder, Sqlite};
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::common::repository_error::RepositoryError;
use crate::elements::extensions::into_element_id_ext::IntoElementIdExt;
use crate::elements::value_objects::element_id::ElementId;
use crate::infrastructure::repositories::sqlite::ids_json::ids_json;
use crate::infrastructure::repositories::sqlite::text_prefilter::TextPrefilter;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::search::repositories::content_search_repository::ContentSearchRepository;
use crate::search::value_objects::content_part::{ContentPart, ContentPartRef};

/// Mirrors `part`'s numbering in `find_candidate_parts`' query.
fn content_part(element_id: ElementId, part: i64) -> ContentPart {
    match (element_id, part) {
        (ElementId::LearningAsset(_), seq) => ContentPart::LearningAssetSplit(seq as u32),
        (ElementId::Card(_), 1) => ContentPart::CardBack,
        (ElementId::Card(_), _) => ContentPart::CardFront,
        _ => ContentPart::Extract,
    }
}

#[derive(ScopeInjectable)]
pub struct SqliteContentSearchRepository {
    tx: Arc<DbTransaction>,
}

impl SqliteContentSearchRepository {
    /// Candidate parts of every live element, or only of `element_id`'s.
    async fn candidate_parts(
        &self,
        query: &str,
        case_sensitive: bool,
        element_id: Option<ElementId>,
    ) -> Result<Vec<ContentPartRef>, RepositoryError> {
        let prefilter = TextPrefilter::new(query, case_sensitive);
        let element_id = element_id.map(|id| id.id().hyphenated().to_string());
        let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            "SELECT m.element_id, m.element_type, p.part FROM (\
             SELECT learning_asset_id AS id, seq AS part FROM learning_asset_splits",
        );
        for (table_part, column, id_column) in [
            ("", "content_text", "learning_asset_id"),
            (
                " UNION ALL SELECT id, 0 FROM extracts",
                "content_text",
                "id",
            ),
            (" UNION ALL SELECT id, 0 FROM cards", "front_text", "id"),
            (" UNION ALL SELECT id, 1 FROM cards", "back_text", "id"),
        ] {
            query_builder.push(table_part);
            prefilter.push(&mut query_builder, column);
            if let Some(element_id) = &element_id {
                query_builder.push(format!(" AND {id_column} = "));
                query_builder.push_bind(element_id.clone());
            }
        }
        // Only ids are sorted here; texts are read afterwards, as few as the match cap needs.
        query_builder.push(
            ") p JOIN meta m ON m.element_id = p.id \
             WHERE m.trashed_at IS NULL \
             ORDER BY m.priority, m.element_id, p.part",
        );

        let rows: Vec<(Hyphenated, String, i64)> = {
            let mut tx = self.tx.lock().await;
            query_builder
                .build_query_as()
                .fetch_all(tx.as_mut())
                .await?
        };

        Ok(rows
            .into_iter()
            .map(|(id, element_type, part)| {
                let element_id = (id.into_uuid(), element_type).into_element_id();
                ContentPartRef {
                    element_id,
                    part: content_part(element_id, part),
                }
            })
            .collect())
    }
}

#[async_trait]
impl ContentSearchRepository for SqliteContentSearchRepository {
    async fn find_candidate_parts(
        &self,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<ContentPartRef>, RepositoryError> {
        self.candidate_parts(query, case_sensitive, None).await
    }

    async fn find_element_candidate_parts(
        &self,
        element_id: ElementId,
        query: &str,
        case_sensitive: bool,
    ) -> Result<Vec<ContentPartRef>, RepositoryError> {
        self.candidate_parts(query, case_sensitive, Some(element_id))
            .await
    }

    async fn has_text(&self, element_id: ElementId) -> Result<bool, RepositoryError> {
        let id = element_id.id().hyphenated().to_string();
        let mut tx = self.tx.lock().await;
        let has_text: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM learning_asset_splits WHERE learning_asset_id = $1) \
                 OR EXISTS (SELECT 1 FROM extracts WHERE id = $1) \
                 OR EXISTS (SELECT 1 FROM cards WHERE id = $1)",
        )
        .bind(id)
        .fetch_one(tx.as_mut())
        .await?;
        Ok(has_text)
    }

    async fn get_part_texts(
        &self,
        parts: &[ContentPartRef],
    ) -> Result<Vec<String>, RepositoryError> {
        let mut split_keys = Vec::new();
        let mut extract_ids = Vec::new();
        let mut front_ids = Vec::new();
        let mut back_ids = Vec::new();
        for part in parts {
            let id = part.element_id.id();
            match part.part {
                ContentPart::LearningAssetSplit(seq) => {
                    split_keys.push(serde_json::json!([id.hyphenated().to_string(), seq]));
                }
                ContentPart::Extract => extract_ids.push(id),
                ContentPart::CardFront => front_ids.push(id),
                ContentPart::CardBack => back_ids.push(id),
            }
        }

        let mut texts: HashMap<(Uuid, ContentPart), String> = HashMap::new();
        let mut tx = self.tx.lock().await;
        let conn = tx.as_mut();

        if !split_keys.is_empty() {
            let rows: Vec<(Hyphenated, i64, String)> = sqlx::query_as(
                "SELECT s.learning_asset_id, s.seq, s.content_text \
                 FROM json_each($1) k \
                 JOIN learning_asset_splits s \
                   ON s.learning_asset_id = json_extract(k.value, '$[0]') \
                  AND s.seq = json_extract(k.value, '$[1]')",
            )
            .bind(serde_json::Value::Array(split_keys).to_string())
            .fetch_all(&mut *conn)
            .await?;
            for (id, seq, text) in rows {
                texts.insert(
                    (id.into_uuid(), ContentPart::LearningAssetSplit(seq as u32)),
                    text,
                );
            }
        }

        if !extract_ids.is_empty() {
            let rows: Vec<(Hyphenated, String)> = sqlx::query_as(
                "SELECT id, content_text FROM extracts \
                 WHERE id IN (SELECT value FROM json_each($1))",
            )
            .bind(ids_json(extract_ids))
            .fetch_all(&mut *conn)
            .await?;
            for (id, text) in rows {
                texts.insert((id.into_uuid(), ContentPart::Extract), text);
            }
        }

        // Only the side that was a candidate is read.
        for (ids, sql, part) in [
            (
                front_ids,
                "SELECT id, front_text FROM cards WHERE id IN (SELECT value FROM json_each($1))",
                ContentPart::CardFront,
            ),
            (
                back_ids,
                "SELECT id, back_text FROM cards WHERE id IN (SELECT value FROM json_each($1))",
                ContentPart::CardBack,
            ),
        ] {
            if ids.is_empty() {
                continue;
            }
            let rows: Vec<(Hyphenated, String)> = sqlx::query_as(sql)
                .bind(ids_json(ids))
                .fetch_all(&mut *conn)
                .await?;
            for (id, text) in rows {
                texts.insert((id.into_uuid(), part), text);
            }
        }

        Ok(parts
            .iter()
            .map(|part| {
                texts
                    .remove(&(part.element_id.id(), part.part))
                    .unwrap_or_default()
            })
            .collect())
    }

    async fn get_names(&self, element_ids: &[ElementId]) -> Result<Vec<String>, RepositoryError> {
        if element_ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows: Vec<(Hyphenated, String)> = {
            let mut tx = self.tx.lock().await;
            sqlx::query_as(
                "SELECT element_id, name FROM meta \
                 WHERE element_id IN (SELECT value FROM json_each($1))",
            )
            .bind(ids_json(element_ids.iter().map(ElementId::id)))
            .fetch_all(tx.as_mut())
            .await?
        };
        let mut names: HashMap<Uuid, String> = rows
            .into_iter()
            .map(|(id, name)| (id.into_uuid(), name))
            .collect();
        Ok(element_ids
            .iter()
            .map(|element_id| names.remove(&element_id.id()).unwrap_or_default())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::injector::Injector;
    use injector::register_scope;

    use crate::elements::entities::card::Card;
    use crate::elements::entities::extract::Extract;
    use crate::elements::entities::learning_asset::LearningAsset;
    use crate::elements::entities::learning_asset_split::LearningAssetSplit;
    use crate::elements::repositories::card_repository::CardRepository;
    use crate::elements::repositories::extract_repository::ExtractRepository;
    use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::learning_asset_content::LearningAssetContent;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::elements::value_objects::reading_position::ReadingPosition;
    use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_repository::SqliteLearningAssetRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_trash_repository::SqliteTrashRepository;
    use crate::test_utils::create_test_injector;
    use crate::trash::repositories::trash_repository::TrashRepository;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn TrashRepository, SqliteTrashRepository);
        register_scope!(
            injector,
            dyn ContentSearchRepository,
            SqliteContentSearchRepository
        );
        injector
    }

    fn make_meta(element_id: ElementId, name: &str, priority: FractionalIndex) -> Meta {
        Meta {
            element_id,
            name: name.into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority,
            study_profile_id: None,
            bibliographical_source_id: None,
            derived_from: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    fn content_json(text: &str) -> String {
        format!(
            r#"{{"root":{{"children":[{{"type":"paragraph","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
        )
    }

    fn make_card(front: &str, back: &str, priority: FractionalIndex) -> Card {
        Card {
            meta: make_meta(ElementId::Card(Uuid::new_v4()), "card", priority),
            front: content_json(front),
            back: content_json(back),
        }
    }

    fn make_extract(text: &str, priority: FractionalIndex) -> Extract {
        Extract {
            meta: make_meta(ElementId::Extract(Uuid::new_v4()), "extract", priority),
            content: content_json(text),
            interval_multiplier: 1.2,
        }
    }

    async fn create_learning_asset(
        repository: &dyn LearningAssetRepository,
        splits: &[&str],
        priority: FractionalIndex,
    ) -> ElementId {
        let learning_asset = LearningAsset {
            r#type: Default::default(),
            meta: make_meta(ElementId::LearningAsset(Uuid::new_v4()), "asset", priority),
            read_point: ReadingPosition::default(),
            interval_multiplier: 1.2,
        };
        let element_id = learning_asset.meta.element_id;
        let splits = splits
            .iter()
            .enumerate()
            .map(|(seq, text)| LearningAssetSplit::new(seq as u32, content_json(text)))
            .collect();
        repository
            .create(learning_asset, LearningAssetContent::Extracted(splits))
            .await
            .unwrap();
        element_id
    }

    #[tokio::test]
    async fn find_candidate_parts_substring_returns_matching_parts_by_priority() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let learning_asset_repository = scope.resolve::<dyn LearningAssetRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let first = FractionalIndex::default();
        let second = FractionalIndex::new_after(&first);
        let learning_asset_id = create_learning_asset(
            learning_asset_repository.as_ref(),
            &["no match", "Photosynthesis"],
            second,
        )
        .await;
        let card = make_card("plants use SYNTHESIS", "unrelated", first);
        let card_id = card.meta.element_id;
        card_repository.create(card).await.unwrap();

        // Act

        let actual = repository
            .find_candidate_parts("synth", false)
            .await
            .unwrap();

        // Assert

        let parts: Vec<_> = actual
            .iter()
            .map(|part| (part.element_id, part.part))
            .collect();
        assert_eq!(
            vec![
                (card_id, ContentPart::CardFront),
                (learning_asset_id, ContentPart::LearningAssetSplit(1)),
            ],
            parts
        );
    }

    #[tokio::test]
    async fn find_candidate_parts_case_sensitive_skips_other_casings() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let lower = make_extract("rust", FractionalIndex::default());
        let lower_id = lower.meta.element_id;
        extract_repository.create(lower).await.unwrap();
        extract_repository
            .create(make_extract(
                "Rust",
                FractionalIndex::new_after(&FractionalIndex::default()),
            ))
            .await
            .unwrap();

        // Act

        let actual = repository.find_candidate_parts("rust", true).await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(lower_id, actual[0].element_id);
    }

    #[tokio::test]
    async fn find_candidate_parts_non_ascii_query_keeps_other_casings() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let extract = make_extract("ÜBER", FractionalIndex::default());
        let extract_id = extract.meta.element_id;
        extract_repository.create(extract).await.unwrap();

        // Act

        let actual = repository
            .find_candidate_parts("über", false)
            .await
            .unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(extract_id, actual[0].element_id);
    }

    /// The ids of the extracts whose text is a candidate for `query`, ignoring case.
    async fn candidate_texts(texts: &[&str], query: &str) -> Vec<String> {
        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;
        let mut ids = HashMap::new();
        for text in texts {
            let extract = make_extract(text, FractionalIndex::default());
            ids.insert(extract.meta.element_id, text.to_string());
            extract_repository.create(extract).await.unwrap();
        }
        let mut found: Vec<String> = repository
            .find_candidate_parts(query, false)
            .await
            .unwrap()
            .into_iter()
            .map(|part| ids[&part.element_id].clone())
            .collect();
        found.sort();
        found
    }

    #[tokio::test]
    async fn find_candidate_parts_non_ascii_query_skips_texts_without_it() {
        // Act

        let actual = candidate_texts(&["ÜBER alles", "aber", "über"], "über").await;

        // Assert

        assert_eq!(vec!["ÜBER alles", "über"], actual);
    }

    #[tokio::test]
    async fn find_candidate_parts_non_ascii_only_query_keeps_every_casing() {
        // Act

        let actual = candidate_texts(&["МИР", "Мир", "world"], "мир").await;

        // Assert

        assert_eq!(vec!["МИР", "Мир"], actual);
    }

    #[tokio::test]
    async fn find_candidate_parts_letter_with_compatibility_casing_keeps_it() {
        // Arrange

        // The ohm sign lowercases to ω, like Ω does.
        let texts = ["\u{2126}", "Ω", "α"];

        // Act

        let actual = candidate_texts(&texts, "ω").await;

        // Assert

        assert_eq!(vec!["Ω", "\u{2126}"], actual);
    }

    #[tokio::test]
    async fn find_candidate_parts_final_sigma_query_keeps_capital_sigma() {
        // Act

        let actual = candidate_texts(&["ΛΌΓΟΣ", "λόγος", "λόγο"], "ς").await;

        // Assert

        assert_eq!(vec!["ΛΌΓΟΣ", "λόγος"], actual);
    }

    #[tokio::test]
    async fn find_candidate_parts_ascii_query_keeps_text_folding_to_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let extract = make_extract("İstanbul", FractionalIndex::default());
        let extract_id = extract.meta.element_id;
        extract_repository.create(extract).await.unwrap();

        // Act

        let actual = repository.find_candidate_parts("i", false).await.unwrap();

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!(extract_id, actual[0].element_id);
    }

    #[tokio::test]
    async fn find_candidate_parts_like_wildcards_match_literally() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        extract_repository
            .create(make_extract("100 percent", FractionalIndex::default()))
            .await
            .unwrap();

        // Act

        let actual = repository.find_candidate_parts("0%", false).await.unwrap();

        // Assert

        assert!(actual.is_empty());
    }

    #[tokio::test]
    async fn find_candidate_parts_trashed_element_is_excluded() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let trash_repository = scope.resolve::<dyn TrashRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let extract = make_extract("needle", FractionalIndex::default());
        let extract_id = extract.meta.element_id;
        extract_repository.create(extract).await.unwrap();
        trash_repository
            .trash(extract_id, Utc::now())
            .await
            .unwrap();

        // Act

        let actual = repository
            .find_candidate_parts("needle", false)
            .await
            .unwrap();

        // Assert

        assert!(actual.is_empty());
    }

    #[tokio::test]
    async fn get_part_texts_mixed_parts_returns_texts_in_given_order() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let learning_asset_repository = scope.resolve::<dyn LearningAssetRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let learning_asset_id = create_learning_asset(
            learning_asset_repository.as_ref(),
            &["split zero", "split one"],
            FractionalIndex::default(),
        )
        .await;
        let card = make_card("the front", "the back", FractionalIndex::default());
        let card_id = card.meta.element_id;
        card_repository.create(card).await.unwrap();
        let extract = make_extract("the extract", FractionalIndex::default());
        let extract_id = extract.meta.element_id;
        extract_repository.create(extract).await.unwrap();
        let part = |element_id, part| ContentPartRef { element_id, part };

        // Act

        let actual = repository
            .get_part_texts(&[
                part(card_id, ContentPart::CardBack),
                part(learning_asset_id, ContentPart::LearningAssetSplit(1)),
                part(extract_id, ContentPart::Extract),
                part(card_id, ContentPart::CardFront),
            ])
            .await
            .unwrap();

        // Assert

        assert_eq!(
            vec!["the back", "split one", "the extract", "the front"],
            actual
        );
    }

    #[tokio::test]
    async fn get_names_mixed_ids_returns_names_in_given_order() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let repository = scope.resolve::<dyn ContentSearchRepository>().await;

        let card = make_card("front", "back", FractionalIndex::default());
        let card_id = card.meta.element_id;
        card_repository.create(card).await.unwrap();
        let extract = make_extract("text", FractionalIndex::default());
        let extract_id = extract.meta.element_id;
        extract_repository.create(extract).await.unwrap();
        let missing_id = ElementId::Extract(Uuid::new_v4());

        // Act

        let actual = repository
            .get_names(&[extract_id, missing_id, card_id])
            .await
            .unwrap();

        // Assert

        assert_eq!(vec!["extract", "", "card"], actual);
    }
}
