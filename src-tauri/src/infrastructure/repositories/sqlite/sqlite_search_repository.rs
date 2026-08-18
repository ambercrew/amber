use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;
use sqlx::{QueryBuilder, Sqlite};
use uuid::Uuid;
use uuid::fmt::Hyphenated;

use crate::common::repository_error::RepositoryError;
use crate::elements::entities::tag::Tag;
use crate::elements::extensions::into_element_id_ext::IntoElementIdExt;
use crate::elements::services::priority_service::{PriorityError, PriorityInfo, PriorityService};
use crate::infrastructure::repositories::sqlite::sqlite_rows::search_row::SearchRow;
use crate::infrastructure::repositories::sqlite::sqlite_rows::tag_row::TagRow;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::saved_searches::entities::saved_search_filter::{
    DateFilterOperator, ElementFilter, ElementNodeType, SelectFilterOperator,
};
use crate::search::entities::element_search_result::ElementSearchResult;
use crate::search::repositories::search_repository::SearchRepository;

#[derive(ScopeInjectable)]
pub struct SqliteSearchRepository {
    tx: Arc<DbTransaction>,
    priority_service: Arc<dyn PriorityService>,
}

#[async_trait]
impl SearchRepository for SqliteSearchRepository {
    async fn search(
        &self,
        filters: &[ElementFilter],
    ) -> Result<Vec<ElementSearchResult>, RepositoryError> {
        let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"SELECT
                m.element_id as "element_id",
                m.element_type as "element_type",
                m.name as "name",
                COALESCE(cr.due, lar.due) as "due"
            FROM meta m
            LEFT JOIN card_reviews cr ON cr.card_id = m.element_id AND m.element_type = 'card'
            LEFT JOIN learning_asset_reviews lar ON lar.element_id = m.element_id AND m.element_type IN ('learning_asset', 'extract')
            WHERE m.trashed_at IS NULL"#,
        );

        for filter in filters {
            query_builder.push(" AND (");
            push_filter_clause(&mut query_builder, filter);
            query_builder.push(")");
        }

        query_builder.push(" ORDER BY m.priority");

        // The lock is scoped to this block and released before consulting
        // priority_service below, which locks the same transaction internally.
        let (rows, mut tags_by_element_id) = {
            let mut tx = self.tx.lock().await;
            let conn = tx.as_mut();

            let rows: Vec<SearchRow> = query_builder
                .build_query_as::<SearchRow>()
                .fetch_all(&mut *conn)
                .await?;

            let element_ids: Vec<Uuid> =
                rows.iter().map(|row| row.element_id.into_uuid()).collect();
            let tags_by_element_id = fetch_tags(conn, &element_ids).await?;

            (rows, tags_by_element_id)
        };

        let element_ids: Vec<_> = rows
            .iter()
            .map(|row| (row.element_id.into_uuid(), row.element_type.clone()).into_element_id())
            .collect();
        let mut priority_by_element_id = self
            .priority_service
            .get_priority_info_batch(&element_ids)
            .await
            .map_err(|err| match err {
                PriorityError::Repository(err) => err,
                PriorityError::PriorityExhausted => RepositoryError::QueryFailed(Box::new(err)),
            })?;

        let mut results = Vec::with_capacity(rows.len());
        for (row, element_id) in rows.into_iter().zip(element_ids) {
            let priority = priority_by_element_id
                .remove(&element_id)
                .unwrap_or(PriorityInfo {
                    rank: 0,
                    total: 0,
                    percentage: 0.0,
                });
            results.push(ElementSearchResult {
                tags: tags_by_element_id
                    .remove(&row.element_id.into_uuid())
                    .unwrap_or_default(),
                element_id,
                name: row.name,
                priority,
                due: row.due,
            });
        }

        for filter in filters {
            if let ElementFilter::Priority { min, max, .. } = filter {
                results.retain(|result| {
                    let percentage = result.priority.percentage;
                    percentage >= *min as f64 && percentage <= *max as f64
                });
            }
        }

        Ok(results)
    }
}

async fn fetch_tags(
    conn: &mut sqlx::SqliteConnection,
    element_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<Tag>>, RepositoryError> {
    if element_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"SELECT
            et.element_id as "element_id",
            t.name as "name",
            t.created_at as "created_at",
            t.modified_at as "modified_at"
        FROM element_tags et
        JOIN tags t ON t.name = et.tag_id
        WHERE et.element_id IN ("#,
    );
    let hyphenated_element_ids: Vec<Hyphenated> =
        element_ids.iter().map(|id| id.hyphenated()).collect();
    push_in_list(&mut query_builder, &hyphenated_element_ids);
    query_builder.push(") ORDER BY et.element_id, et.sort_index");

    let rows: Vec<TaggedRow> = query_builder
        .build_query_as::<TaggedRow>()
        .fetch_all(conn)
        .await?;

    let mut tags_by_element_id: HashMap<Uuid, Vec<Tag>> = HashMap::new();
    for row in rows {
        tags_by_element_id
            .entry(row.element_id.into_uuid())
            .or_default()
            .push(Tag::from(TagRow {
                name: row.name,
                created_at: row.created_at,
                modified_at: row.modified_at,
            }));
    }
    Ok(tags_by_element_id)
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct TaggedRow {
    element_id: Hyphenated,
    name: String,
    created_at: chrono::DateTime<chrono::Utc>,
    modified_at: chrono::DateTime<chrono::Utc>,
}

fn push_filter_clause(query_builder: &mut QueryBuilder<Sqlite>, filter: &ElementFilter) {
    match filter {
        ElementFilter::Name {
            operator, value, ..
        } => {
            let pattern = match operator {
                crate::saved_searches::entities::saved_search_filter::StringFilterOperator::Contains => {
                    format!("%{}%", escape_like(value))
                }
                crate::saved_searches::entities::saved_search_filter::StringFilterOperator::Equals => {
                    escape_like(value)
                }
                crate::saved_searches::entities::saved_search_filter::StringFilterOperator::StartsWith => {
                    format!("{}%", escape_like(value))
                }
                crate::saved_searches::entities::saved_search_filter::StringFilterOperator::EndsWith => {
                    format!("%{}", escape_like(value))
                }
            };
            query_builder.push("LOWER(m.name) LIKE LOWER(");
            query_builder.push_bind(pattern);
            query_builder.push(") ESCAPE '\\'");
        }
        ElementFilter::Tags { operator, tags, .. } => {
            use crate::saved_searches::entities::saved_search_filter::TagsFilterOperator;
            if tags.is_empty() {
                query_builder.push(match operator {
                    TagsFilterOperator::IsNoneOf => "1 = 1",
                    _ => "1 = 0",
                });
                return;
            }
            match operator {
                TagsFilterOperator::IsAnyOf => {
                    query_builder.push(
                        "m.element_id IN (SELECT element_id FROM element_tags WHERE tag_id IN (",
                    );
                    push_in_list(query_builder, tags);
                    query_builder.push("))");
                }
                TagsFilterOperator::IsNoneOf => {
                    query_builder.push("m.element_id NOT IN (SELECT element_id FROM element_tags WHERE tag_id IN (");
                    push_in_list(query_builder, tags);
                    query_builder.push("))");
                }
                TagsFilterOperator::IsAllOf => {
                    query_builder.push(
                        "m.element_id IN (SELECT element_id FROM element_tags WHERE tag_id IN (",
                    );
                    push_in_list(query_builder, tags);
                    query_builder.push(") GROUP BY element_id HAVING COUNT(DISTINCT tag_id) = ");
                    query_builder.push_bind(tags.len() as i64);
                    query_builder.push(")");
                }
            }
        }
        ElementFilter::DueDate {
            operator,
            days,
            from,
            to,
            ..
        } => push_date_clause(
            query_builder,
            "COALESCE(cr.due, lar.due)",
            operator,
            days,
            from,
            to,
        ),
        ElementFilter::CreatedDate {
            operator,
            days,
            from,
            to,
            ..
        } => push_date_clause(query_builder, "m.created_at", operator, days, from, to),
        ElementFilter::BibliographicalSource {
            operator,
            source_ids,
            ..
        } => push_select_clause(
            query_builder,
            "m.bibliographical_source_id",
            operator,
            source_ids,
        ),
        ElementFilter::ElementType {
            operator, types, ..
        } => {
            let type_strings: Vec<String> = types.iter().map(element_type_string).collect();
            push_select_clause_str(query_builder, "m.element_type", operator, &type_strings);
        }
        ElementFilter::Priority { .. } => {
            // Applied in-memory after the query, since it depends on the
            // computed rank/total which can't be referenced from WHERE.
            query_builder.push("1 = 1");
        }
        ElementFilter::StudyProfile {
            operator,
            profile_ids,
            ..
        } => push_select_clause(query_builder, "m.study_profile_id", operator, profile_ids),
    }
}

fn push_date_clause(
    query_builder: &mut QueryBuilder<Sqlite>,
    column_expr: &str,
    operator: &DateFilterOperator,
    days: &Option<i64>,
    from: &Option<String>,
    to: &Option<String>,
) {
    match operator {
        DateFilterOperator::Today => {
            query_builder.push(format!("date({column_expr}) = date('now')"));
        }
        DateFilterOperator::WithinDays => match days {
            Some(days) => {
                query_builder.push(format!(
                    "date({column_expr}) BETWEEN date('now') AND date('now', '+' || "
                ));
                query_builder.push_bind(*days);
                query_builder.push(" || ' days')");
            }
            None => {
                query_builder.push("1 = 1");
            }
        },
        DateFilterOperator::Before => match from {
            Some(from) => {
                query_builder.push(format!("date({column_expr}) < date("));
                query_builder.push_bind(from.clone());
                query_builder.push(")");
            }
            None => {
                query_builder.push("1 = 1");
            }
        },
        DateFilterOperator::After => match from {
            Some(from) => {
                query_builder.push(format!("date({column_expr}) > date("));
                query_builder.push_bind(from.clone());
                query_builder.push(")");
            }
            None => {
                query_builder.push("1 = 1");
            }
        },
        DateFilterOperator::Between => match (from, to) {
            (Some(from), Some(to)) => {
                query_builder.push(format!("date({column_expr}) BETWEEN date("));
                query_builder.push_bind(from.clone());
                query_builder.push(") AND date(");
                query_builder.push_bind(to.clone());
                query_builder.push(")");
            }
            _ => {
                query_builder.push("1 = 1");
            }
        },
    }
}

fn push_select_clause(
    query_builder: &mut QueryBuilder<Sqlite>,
    column: &str,
    operator: &SelectFilterOperator,
    ids: &[Uuid],
) {
    if ids.is_empty() {
        query_builder.push(match operator {
            SelectFilterOperator::IsNoneOf => "1 = 1",
            SelectFilterOperator::IsAnyOf => "1 = 0",
        });
        return;
    }
    let hyphenated_ids: Vec<Hyphenated> = ids.iter().map(|id| id.hyphenated()).collect();
    match operator {
        SelectFilterOperator::IsAnyOf => {
            query_builder.push(format!("{column} IN ("));
            push_in_list(query_builder, &hyphenated_ids);
            query_builder.push(")");
        }
        SelectFilterOperator::IsNoneOf => {
            query_builder.push(format!("{column} IS NULL OR {column} NOT IN ("));
            push_in_list(query_builder, &hyphenated_ids);
            query_builder.push(")");
        }
    }
}

fn push_select_clause_str(
    query_builder: &mut QueryBuilder<Sqlite>,
    column: &str,
    operator: &SelectFilterOperator,
    values: &[String],
) {
    if values.is_empty() {
        query_builder.push(match operator {
            SelectFilterOperator::IsNoneOf => "1 = 1",
            SelectFilterOperator::IsAnyOf => "1 = 0",
        });
        return;
    }
    match operator {
        SelectFilterOperator::IsAnyOf => {
            query_builder.push(format!("{column} IN ("));
            push_in_list(query_builder, values);
            query_builder.push(")");
        }
        SelectFilterOperator::IsNoneOf => {
            query_builder.push(format!("{column} NOT IN ("));
            push_in_list(query_builder, values);
            query_builder.push(")");
        }
    }
}

fn push_in_list<T>(query_builder: &mut QueryBuilder<Sqlite>, values: &[T])
where
    T: Clone + Send + 'static + sqlx::Type<Sqlite> + for<'q> sqlx::Encode<'q, Sqlite>,
{
    let mut separated = query_builder.separated(", ");
    for value in values {
        separated.push_bind(value.clone());
    }
}

fn element_type_string(node_type: &ElementNodeType) -> String {
    match node_type {
        ElementNodeType::Folder => "folder".into(),
        ElementNodeType::LearningAsset => "learning_asset".into(),
        ElementNodeType::Extract => "extract".into(),
        ElementNodeType::Card => "card".into(),
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::bibliographical_sources::entities::bibliographical_source::BibliographicalSource;
    use crate::bibliographical_sources::repositories::bibliographical_source_repository::BibliographicalSourceRepository;
    use crate::bibliographical_sources::value_objects::bibliographical_source_type::BibliographicalSourceType;
    use crate::elements::entities::card::Card;
    use crate::elements::entities::folder::Folder;
    use crate::elements::entities::learning_asset::{LearningAsset, LearningAssetSplit};
    use crate::elements::repositories::card_repository::CardRepository;
    use crate::elements::repositories::folder_repository::FolderRepository;
    use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::services::implementations::default_priority_service::DefaultPriorityService;
    use crate::elements::services::priority_service::PriorityService;
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::read_point::ReadPoint;
    use crate::infrastructure::repositories::sqlite::sqlite_bibliographical_source_repository::SqliteBibliographicalSourceRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_card_review_repository::SqliteCardReviewRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_folder_repository::SqliteFolderRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_repository::SqliteLearningAssetRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_study_profile_repository::SqliteStudyProfileRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_trash_repository::SqliteTrashRepository;
    use crate::saved_searches::entities::saved_search_filter::{
        DateFilterOperator, ElementNodeType, SelectFilterOperator, StringFilterOperator,
        TagsFilterOperator,
    };
    use crate::study::entities::card_review::CardReview;
    use crate::study::entities::learning_asset_review::LearningAssetReview;
    use crate::study::entities::study_profile::StudyProfile;
    use crate::study::repositories::card_review_repository::CardReviewRepository;
    use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
    use crate::study::repositories::study_profile_repository::StudyProfileRepository;
    use crate::study::value_objects::card_state::CardState;
    use crate::test_utils::create_test_injector;
    use crate::trash::repositories::trash_repository::TrashRepository;
    use chrono::Duration;
    use uuid::Uuid;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(
            injector,
            dyn CardReviewRepository,
            SqliteCardReviewRepository
        );
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(injector, dyn TrashRepository, SqliteTrashRepository);
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
        register_scope!(injector, dyn PriorityService, DefaultPriorityService);
        register_scope!(injector, dyn SearchRepository, SqliteSearchRepository);
        injector
    }

    fn make_folder(name: &str, priority: FractionalIndex) -> Folder {
        Folder {
            meta: Meta {
                element_id: ElementId::Folder(Uuid::new_v4()),
                name: name.into(),
                parent: None,
                position: FractionalIndex::default(),
                priority,
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
        }
    }

    fn make_card(name: &str, priority: FractionalIndex) -> Card {
        Card {
            meta: Meta {
                element_id: ElementId::Card(Uuid::new_v4()),
                name: name.into(),
                parent: None,
                position: FractionalIndex::default(),
                priority,
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
            front: "front".into(),
            back: "back".into(),
        }
    }

    fn make_learning_asset(name: &str, priority: FractionalIndex) -> LearningAsset {
        LearningAsset {
            meta: Meta {
                element_id: ElementId::LearningAsset(Uuid::new_v4()),
                name: name.into(),
                parent: None,
                position: FractionalIndex::default(),
                priority,
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            },
            read_point: ReadPoint::default(),
            interval_multiplier: 1.0,
        }
    }

    #[tokio::test]
    async fn search_no_filters_returns_all_live_elements_ordered_by_priority() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let first = make_folder("A", FractionalIndex::default());
        let second = make_folder("B", FractionalIndex::new_after(&FractionalIndex::default()));
        let first_id = first.meta.element_id;
        let second_id = second.meta.element_id;
        folder_repository.create(first).await.unwrap();
        folder_repository.create(second).await.unwrap();

        // Act

        let results = search_repository.search(&[]).await.unwrap();

        // Assert

        assert_eq!(2, results.len());
        assert_eq!(first_id, results[0].element_id);
        assert_eq!(second_id, results[1].element_id);
        assert_eq!(1, results[0].priority.rank);
        assert_eq!(2, results[0].priority.total);
    }

    #[tokio::test]
    async fn search_name_filter_contains_matches_case_insensitively() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let matching = make_folder("Philosophy Backlog", FractionalIndex::default());
        let other = make_folder(
            "Chemistry",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let matching_id = matching.meta.element_id;
        folder_repository.create(matching).await.unwrap();
        folder_repository.create(other).await.unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::Contains,
            value: "philo".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(matching_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_tags_filter_is_any_of_returns_only_tagged_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let tagged = make_folder("Tagged", FractionalIndex::default());
        let untagged = make_folder(
            "Untagged",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let tagged_id = tagged.meta.element_id;
        folder_repository.create(tagged).await.unwrap();
        folder_repository.create(untagged).await.unwrap();
        meta_repository
            .update_tags(tagged_id, vec!["philosophy".into()])
            .await
            .unwrap();

        let filters = vec![ElementFilter::Tags {
            id: Uuid::new_v4(),
            operator: TagsFilterOperator::IsAnyOf,
            tags: vec!["philosophy".into()],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(tagged_id, results[0].element_id);
        assert_eq!(1, results[0].tags.len());
        assert_eq!("philosophy", results[0].tags[0].name);
    }

    #[tokio::test]
    async fn search_returns_card_due_date_from_card_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let card_review_repository = scope.resolve::<dyn CardReviewRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let card = make_card("Card", FractionalIndex::default());
        let card_id = card.meta.element_id;
        card_repository.create(card).await.unwrap();

        let due = Utc::now();
        card_review_repository
            .upsert(&CardReview {
                card_id: card_id.id(),
                due,
                stability: 1.0,
                difficulty: 1.0,
                reps: 0,
                lapses: 0,
                state: CardState::New,
                last_reviewed: None,
            })
            .await
            .unwrap();

        // Act

        let results = search_repository.search(&[]).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(due.timestamp(), results[0].due.unwrap().timestamp());
    }

    #[tokio::test]
    async fn search_priority_filter_between_excludes_out_of_range_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let pos_a = FractionalIndex::default();
        let pos_b = FractionalIndex::new_after(&pos_a);
        let pos_c = FractionalIndex::new_after(&pos_b);
        let first = make_folder("A", pos_a);
        let second = make_folder("B", pos_b);
        let third = make_folder("C", pos_c);
        let second_id = second.meta.element_id;
        folder_repository.create(first).await.unwrap();
        folder_repository.create(second).await.unwrap();
        folder_repository.create(third).await.unwrap();

        // rank 1 -> 33.3%, rank 2 -> 66.6%, rank 3 -> 100%
        let filters = vec![ElementFilter::Priority {
            id: Uuid::new_v4(),
            operator:
                crate::saved_searches::entities::saved_search_filter::RangeFilterOperator::Between,
            min: 50,
            max: 80,
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(second_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_name_filter_equals_matches_exact_name_only() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let exact = make_folder("Physics", FractionalIndex::default());
        let longer = make_folder(
            "Physics 101",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let exact_id = exact.meta.element_id;
        folder_repository.create(exact).await.unwrap();
        folder_repository.create(longer).await.unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::Equals,
            value: "physics".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(exact_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_name_filter_starts_with_matches_prefix_only() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let matching = make_folder("Biology", FractionalIndex::default());
        let other = make_folder(
            "Chemistry",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let matching_id = matching.meta.element_id;
        folder_repository.create(matching).await.unwrap();
        folder_repository.create(other).await.unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::StartsWith,
            value: "Bio".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(matching_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_name_filter_ends_with_matches_suffix_only() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let matching = make_folder("Backlog", FractionalIndex::default());
        let other = make_folder(
            "Chemistry",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let matching_id = matching.meta.element_id;
        folder_repository.create(matching).await.unwrap();
        folder_repository.create(other).await.unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::EndsWith,
            value: "log".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(matching_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_name_filter_escapes_like_wildcards_in_value() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let literal = make_folder("50%_done", FractionalIndex::default());
        let other = make_folder(
            "50Xdone",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let literal_id = literal.meta.element_id;
        folder_repository.create(literal).await.unwrap();
        folder_repository.create(other).await.unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::Contains,
            value: "%_".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(literal_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_tags_filter_is_none_of_excludes_tagged_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let tagged = make_folder("Tagged", FractionalIndex::default());
        let untagged = make_folder(
            "Untagged",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let tagged_id = tagged.meta.element_id;
        let untagged_id = untagged.meta.element_id;
        folder_repository.create(tagged).await.unwrap();
        folder_repository.create(untagged).await.unwrap();
        meta_repository
            .update_tags(tagged_id, vec!["philosophy".into()])
            .await
            .unwrap();

        let filters = vec![ElementFilter::Tags {
            id: Uuid::new_v4(),
            operator: TagsFilterOperator::IsNoneOf,
            tags: vec!["philosophy".into()],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(untagged_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_tags_filter_is_all_of_requires_every_tag() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let both = make_folder("Both", FractionalIndex::default());
        let one = make_folder(
            "OneOnly",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let both_id = both.meta.element_id;
        let one_id = one.meta.element_id;
        folder_repository.create(both).await.unwrap();
        folder_repository.create(one).await.unwrap();
        meta_repository
            .update_tags(both_id, vec!["philosophy".into(), "history".into()])
            .await
            .unwrap();
        meta_repository
            .update_tags(one_id, vec!["philosophy".into()])
            .await
            .unwrap();

        let filters = vec![ElementFilter::Tags {
            id: Uuid::new_v4(),
            operator: TagsFilterOperator::IsAllOf,
            tags: vec!["philosophy".into(), "history".into()],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(both_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_tags_filter_is_any_of_with_empty_tags_returns_no_results() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        folder_repository
            .create(make_folder("Solo", FractionalIndex::default()))
            .await
            .unwrap();

        let filters = vec![ElementFilter::Tags {
            id: Uuid::new_v4(),
            operator: TagsFilterOperator::IsAnyOf,
            tags: vec![],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn search_tags_filter_is_none_of_with_empty_tags_returns_all_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        folder_repository
            .create(make_folder("Solo", FractionalIndex::default()))
            .await
            .unwrap();

        let filters = vec![ElementFilter::Tags {
            id: Uuid::new_v4(),
            operator: TagsFilterOperator::IsNoneOf,
            tags: vec![],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
    }

    #[tokio::test]
    async fn search_element_type_filter_returns_only_matching_types() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let folder = make_folder("Folder", FractionalIndex::default());
        let card = make_card(
            "Card",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let card_id = card.meta.element_id;
        folder_repository.create(folder).await.unwrap();
        card_repository.create(card).await.unwrap();

        let filters = vec![ElementFilter::ElementType {
            id: Uuid::new_v4(),
            operator: SelectFilterOperator::IsAnyOf,
            types: vec![ElementNodeType::Card],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(card_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_element_type_filter_is_none_of_excludes_matching_types() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let folder = make_folder("Folder", FractionalIndex::default());
        let card = make_card(
            "Card",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let folder_id = folder.meta.element_id;
        folder_repository.create(folder).await.unwrap();
        card_repository.create(card).await.unwrap();

        let filters = vec![ElementFilter::ElementType {
            id: Uuid::new_v4(),
            operator: SelectFilterOperator::IsNoneOf,
            types: vec![ElementNodeType::Card],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(folder_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_study_profile_filter_returns_only_assigned_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let study_profile_repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let assigned = make_folder("Assigned", FractionalIndex::default());
        let unassigned = make_folder(
            "Unassigned",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let assigned_id = assigned.meta.element_id;
        folder_repository.create(assigned).await.unwrap();
        folder_repository.create(unassigned).await.unwrap();

        let profile_id = Uuid::new_v4();
        study_profile_repository
            .create(&StudyProfile {
                id: profile_id,
                created_at: Utc::now(),
                modified_at: Utc::now(),
                name: "Profile".into(),
                is_default: false,
                desired_retention: 0.9,
                fsrs_params: None,
                initial_interval_multiplier: 1.0,
                initial_interval_days: 1.0,
                min_interval_days: 1.0,
            })
            .await
            .unwrap();
        meta_repository
            .set_study_profile(assigned_id, Some(profile_id))
            .await
            .unwrap();

        let filters = vec![ElementFilter::StudyProfile {
            id: Uuid::new_v4(),
            operator: SelectFilterOperator::IsAnyOf,
            profile_ids: vec![profile_id],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(assigned_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_bibliographical_source_filter_returns_only_matching_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let bibliographical_source_repository =
            scope.resolve::<dyn BibliographicalSourceRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let matching = make_folder("Matching", FractionalIndex::default());
        let other = make_folder(
            "Other",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let matching_id = matching.meta.element_id;
        folder_repository.create(matching).await.unwrap();
        folder_repository.create(other).await.unwrap();

        let source_id = Uuid::new_v4();
        bibliographical_source_repository
            .create(&BibliographicalSource {
                id: source_id,
                title: "Source".into(),
                authors: None,
                publication_date: None,
                source_type: BibliographicalSourceType::File,
                location: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            })
            .await
            .unwrap();
        meta_repository
            .set_bibliographical_source(matching_id, Some(source_id))
            .await
            .unwrap();

        let filters = vec![ElementFilter::BibliographicalSource {
            id: Uuid::new_v4(),
            operator: SelectFilterOperator::IsAnyOf,
            source_ids: vec![source_id],
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(matching_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_due_date_filter_today_returns_only_elements_due_today() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let card_review_repository = scope.resolve::<dyn CardReviewRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let due_today = make_card("DueToday", FractionalIndex::default());
        let due_later = make_card(
            "DueLater",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let due_today_id = due_today.meta.element_id;
        let due_later_id = due_later.meta.element_id;
        card_repository.create(due_today).await.unwrap();
        card_repository.create(due_later).await.unwrap();

        card_review_repository
            .upsert(&CardReview {
                card_id: due_today_id.id(),
                due: Utc::now(),
                stability: 1.0,
                difficulty: 1.0,
                reps: 0,
                lapses: 0,
                state: CardState::New,
                last_reviewed: None,
            })
            .await
            .unwrap();
        card_review_repository
            .upsert(&CardReview {
                card_id: due_later_id.id(),
                due: Utc::now() + Duration::days(10),
                stability: 1.0,
                difficulty: 1.0,
                reps: 0,
                lapses: 0,
                state: CardState::New,
                last_reviewed: None,
            })
            .await
            .unwrap();

        let filters = vec![ElementFilter::DueDate {
            id: Uuid::new_v4(),
            operator: DateFilterOperator::Today,
            days: None,
            from: None,
            to: None,
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(due_today_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_due_date_filter_within_days_excludes_elements_due_later() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let card_review_repository = scope.resolve::<dyn CardReviewRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let due_soon = make_card("DueSoon", FractionalIndex::default());
        let due_far = make_card(
            "DueFar",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let due_soon_id = due_soon.meta.element_id;
        let due_far_id = due_far.meta.element_id;
        card_repository.create(due_soon).await.unwrap();
        card_repository.create(due_far).await.unwrap();

        card_review_repository
            .upsert(&CardReview {
                card_id: due_soon_id.id(),
                due: Utc::now() + Duration::days(2),
                stability: 1.0,
                difficulty: 1.0,
                reps: 0,
                lapses: 0,
                state: CardState::New,
                last_reviewed: None,
            })
            .await
            .unwrap();
        card_review_repository
            .upsert(&CardReview {
                card_id: due_far_id.id(),
                due: Utc::now() + Duration::days(30),
                stability: 1.0,
                difficulty: 1.0,
                reps: 0,
                lapses: 0,
                state: CardState::New,
                last_reviewed: None,
            })
            .await
            .unwrap();

        let filters = vec![ElementFilter::DueDate {
            id: Uuid::new_v4(),
            operator: DateFilterOperator::WithinDays,
            days: Some(5),
            from: None,
            to: None,
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(due_soon_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_created_date_filter_between_returns_elements_in_range() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let mut in_range = make_folder("InRange", FractionalIndex::default());
        let mut out_of_range = make_folder(
            "OutOfRange",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        in_range.meta.created_at = Utc::now() - Duration::days(5);
        out_of_range.meta.created_at = Utc::now() - Duration::days(60);
        let in_range_id = in_range.meta.element_id;
        folder_repository.create(in_range).await.unwrap();
        folder_repository.create(out_of_range).await.unwrap();

        let from = (Utc::now() - Duration::days(10))
            .format("%Y-%m-%d")
            .to_string();
        let to = Utc::now().format("%Y-%m-%d").to_string();
        let filters = vec![ElementFilter::CreatedDate {
            id: Uuid::new_v4(),
            operator: DateFilterOperator::Between,
            days: None,
            from: Some(from),
            to: Some(to),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(in_range_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_returns_learning_asset_due_date_from_learning_asset_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let learning_asset_repository = scope.resolve::<dyn LearningAssetRepository>().await;
        let learning_asset_review_repository =
            scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let learning_asset = make_learning_asset("Asset", FractionalIndex::default());
        let learning_asset_id = learning_asset.meta.element_id;
        learning_asset_repository
            .create(
                learning_asset,
                vec![LearningAssetSplit {
                    seq: 0,
                    content: "content".into(),
                }],
            )
            .await
            .unwrap();

        let due = Utc::now();
        learning_asset_review_repository
            .upsert(&LearningAssetReview {
                element_id: learning_asset_id,
                due,
                interval_days: 1.0,
                last_reviewed: None,
                finished_at: None,
            })
            .await
            .unwrap();

        // Act

        let results = search_repository.search(&[]).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(due.timestamp(), results[0].due.unwrap().timestamp());
    }

    #[tokio::test]
    async fn search_excludes_trashed_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let trash_repository = scope.resolve::<dyn TrashRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let live = make_folder("Live", FractionalIndex::default());
        let trashed = make_folder(
            "Trashed",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let live_id = live.meta.element_id;
        let trashed_id = trashed.meta.element_id;
        folder_repository.create(live).await.unwrap();
        folder_repository.create(trashed).await.unwrap();

        trash_repository
            .trash(trashed_id, Utc::now())
            .await
            .unwrap();

        // Act

        let results = search_repository.search(&[]).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(live_id, results[0].element_id);
        assert_ne!(trashed_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_combines_multiple_filters_with_and_semantics() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let meta_repository = scope.resolve::<dyn MetaRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        let matches_both = make_folder("Philosophy Notes", FractionalIndex::default());
        let matches_name_only = make_folder(
            "Philosophy Untagged",
            FractionalIndex::new_after(&FractionalIndex::default()),
        );
        let matches_tag_only = make_folder(
            "Chemistry Notes",
            FractionalIndex::new_after(&FractionalIndex::new_after(&FractionalIndex::default())),
        );
        let matches_both_id = matches_both.meta.element_id;
        let matches_tag_only_id = matches_tag_only.meta.element_id;
        folder_repository.create(matches_both).await.unwrap();
        folder_repository.create(matches_name_only).await.unwrap();
        folder_repository.create(matches_tag_only).await.unwrap();
        meta_repository
            .update_tags(matches_both_id, vec!["philosophy".into()])
            .await
            .unwrap();
        meta_repository
            .update_tags(matches_tag_only_id, vec!["philosophy".into()])
            .await
            .unwrap();

        let filters = vec![
            ElementFilter::Name {
                id: Uuid::new_v4(),
                operator: StringFilterOperator::Contains,
                value: "Philosophy".into(),
            },
            ElementFilter::Tags {
                id: Uuid::new_v4(),
                operator: TagsFilterOperator::IsAnyOf,
                tags: vec!["philosophy".into()],
            },
        ];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert_eq!(1, results.len());
        assert_eq!(matches_both_id, results[0].element_id);
    }

    #[tokio::test]
    async fn search_with_no_matching_elements_returns_empty_vec() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let folder_repository = scope.resolve::<dyn FolderRepository>().await;
        let search_repository = scope.resolve::<dyn SearchRepository>().await;

        folder_repository
            .create(make_folder("Solo", FractionalIndex::default()))
            .await
            .unwrap();

        let filters = vec![ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::Equals,
            value: "nonexistent".into(),
        }];

        // Act

        let results = search_repository.search(&filters).await.unwrap();

        // Assert

        assert!(results.is_empty());
    }
}
