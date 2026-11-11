#[cfg(test)]
use crate::elements::value_objects::reading_position::ReadingPosition;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{Datelike, NaiveDate, Utc};
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::local_configurations::repositories::local_configuration_repository::{
    LocalConfigurationRepository, LocalConfigurationRepositoryExt,
};
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::saved_searches::repositories::saved_search_repository::SavedSearchRepository;
use crate::search::repositories::search_repository::SearchRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::due_elements_service::DueElementsService;
use crate::study::utils::day_boundary::local_date;
use crate::study::value_objects::due_element::DueElement;
use crate::study::value_objects::fuzz_factor_configuration::{
    FUZZ_FACTOR_CONFIGURATION_NAME, FuzzFactorConfiguration,
};
use crate::study::value_objects::study_scope::StudyScope;

#[derive(ScopeInjectable)]
pub struct DefaultDueElementsService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    local_configuration_repository: Arc<dyn LocalConfigurationRepository>,
    saved_search_repository: Arc<dyn SavedSearchRepository>,
    search_repository: Arc<dyn SearchRepository>,
}

impl DefaultDueElementsService {
    async fn all_due(&self) -> Result<Vec<DueElement>, RepositoryError> {
        let as_of = Utc::now();

        let mut due = self.card_review_repository.get_due_cards(as_of).await?;
        due.extend(
            self.learning_asset_review_repository
                .get_due_elements(as_of)
                .await?,
        );
        Ok(due)
    }

    async fn scope_filters(
        &self,
        scope: StudyScope,
    ) -> Result<Vec<ElementFilter>, RepositoryError> {
        match scope {
            StudyScope::SavedSearch(id) => Ok(self
                .saved_search_repository
                .get_filters(id)
                .await?
                .into_iter()
                .map(|saved| saved.filter)
                .collect()),
            StudyScope::Custom(filters) => Ok(filters),
        }
    }

    /// Keeps the entries matching the scope; a scope without filters matches all.
    async fn retain_matching(
        &self,
        due: &mut Vec<DueElement>,
        scope: StudyScope,
    ) -> Result<(), RepositoryError> {
        let filters = self.scope_filters(scope).await?;
        if filters.is_empty() {
            return Ok(());
        }

        let matching = self.search_repository.matching_ids(&filters).await?;
        due.retain(|entry| matching.contains(&entry.element_id));
        Ok(())
    }
}

#[async_trait]
impl DueElementsService for DefaultDueElementsService {
    async fn get_due_elements(
        &self,
        scope: Option<StudyScope>,
    ) -> Result<Vec<DueElement>, RepositoryError> {
        let mut due = self.all_due().await?;

        if let Some(scope) = scope {
            self.retain_matching(&mut due, scope).await?;
        }

        let fuzz_factor = self
            .local_configuration_repository
            .get_by_name::<FuzzFactorConfiguration>(FUZZ_FACTOR_CONFIGURATION_NAME)
            .await
            .ok()
            .flatten()
            .unwrap_or_default()
            .fuzz_factor;

        Ok(order_by_priority_with_fuzz(
            due,
            fuzz_factor,
            local_date(Utc::now()),
        ))
    }
}

/// Sorts elements by priority (ascending — highest priority first), then
/// randomizes their position within fixed-size "brackets" of the sorted
/// list to avoid predictable clusters of equal-priority items.
///
/// `fuzz_factor` (0-100) controls the bracket size as a fraction of the
/// whole queue: 0 keeps the exact priority order, 100 shuffles the entire
/// queue. The shuffle is seeded by `day`, so every fetch on one day agrees.
fn order_by_priority_with_fuzz(
    mut entries: Vec<DueElement>,
    fuzz_factor: u8,
    day: NaiveDate,
) -> Vec<DueElement> {
    entries.sort_by(|a, b| a.priority.cmp(&b.priority));

    let bracket_size = ((entries.len() as f64) * (fuzz_factor.min(100) as f64 / 100.0))
        .round()
        .max(1.0) as usize;

    for bracket in entries.chunks_mut(bracket_size) {
        bracket.sort_by_cached_key(|entry| day_shuffle_key(day, &entry.element_id));
    }

    entries
}

/// A pseudo-random rank for the element on `day`, so its place within a bracket holds all day
/// whatever else is due.
fn day_shuffle_key(day: NaiveDate, element_id: &ElementId) -> u64 {
    let (high, low) = element_id.id().as_u64_pair();
    splitmix64(splitmix64(low ^ day.num_days_from_ce() as u64) ^ high)
}

fn splitmix64(value: u64) -> u64 {
    let mut z = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::name_source::NameSource;
    use chrono::{Duration, NaiveDate, Utc};
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::{
        elements::services::{
            implementations::default_priority_service::DefaultPriorityService,
            priority_service::PriorityService,
        },
        elements::{
            entities::{card::Card, learning_asset::LearningAsset},
            repositories::{
                card_repository::CardRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{learning_asset_content::LearningAssetContent, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_local_configuration_repository::SqliteLocalConfigurationRepository,
            sqlite_meta_repository::SqliteMetaRepository,
        },
        infrastructure::repositories::sqlite::{
            sqlite_saved_search_repository::SqliteSavedSearchRepository,
            sqlite_search_repository::SqliteSearchRepository,
        },
        saved_searches::entities::{
            saved_search::SavedSearch,
            saved_search_filter::{SavedSearchFilter, StringFilterOperator},
        },
        study::entities::learning_asset_review::LearningAssetReview,
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
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
        register_scope!(
            injector,
            dyn LocalConfigurationRepository,
            SqliteLocalConfigurationRepository
        );
        register_scope!(
            injector,
            dyn SavedSearchRepository,
            SqliteSavedSearchRepository
        );
        register_scope!(injector, dyn PriorityService, DefaultPriorityService);
        register_scope!(injector, dyn SearchRepository, SqliteSearchRepository);
        register_scope!(injector, dyn DueElementsService, DefaultDueElementsService);
        injector
    }

    async fn create_new_card(card_repo: &Arc<dyn CardRepository>, name: &str) -> ElementId {
        let card_id = ElementId::Card(Uuid::new_v4());
        card_repo
            .create(Card {
                meta: Meta {
                    name: name.into(),
                    ..make_meta(card_id)
                },
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        card_id
    }

    fn name_contains(value: &str) -> ElementFilter {
        ElementFilter::Name {
            id: Uuid::new_v4(),
            operator: StringFilterOperator::Contains,
            value: value.into(),
        }
    }

    fn make_meta(id: ElementId) -> Meta {
        Meta {
            element_id: id,
            name: "test".into(),
            name_source: NameSource::Manual,
            suspended: false,
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
    async fn get_due_elements_new_card_and_future_learning_asset_returns_only_card() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let learning_asset_repo = scope.resolve::<dyn LearningAssetRepository>().await;
        let learning_asset_review_repo = scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;

        let card_id = ElementId::Card(Uuid::new_v4());
        card_repo
            .create(Card {
                meta: make_meta(card_id),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();

        let learning_asset_id = ElementId::LearningAsset(Uuid::new_v4());
        learning_asset_repo
            .create(
                LearningAsset {
                    r#type: Default::default(),
                    interval_multiplier: 1.2,
                    meta: make_meta(learning_asset_id),
                    read_point: ReadingPosition::default(),
                },
                LearningAssetContent::Extracted(Vec::new()),
            )
            .await
            .unwrap();
        learning_asset_review_repo
            .upsert(&LearningAssetReview {
                element_id: learning_asset_id,
                due: Utc::now() + Duration::days(30),
                interval_days: 30.0,
                last_reviewed: Some(Utc::now()),
                finished_at: None,
            })
            .await
            .unwrap();

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert!(due.contains(&card_id));
        assert!(!due.contains(&learning_asset_id));
    }

    #[tokio::test]
    async fn get_due_elements_due_card_returns_its_name() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        create_new_card(&card_repo, "Capital of Spain").await;

        // Act

        let actual = service.get_due_elements(None).await.unwrap();

        // Assert

        assert_eq!("Capital of Spain", actual[0].name);
    }

    async fn create_saved_search(
        saved_search_repo: &Arc<dyn SavedSearchRepository>,
        name: &str,
        filters: Vec<ElementFilter>,
    ) -> Uuid {
        let saved_search = SavedSearch {
            id: Uuid::new_v4(),
            created_at: Utc::now(),
            modified_at: Utc::now(),
            name: name.into(),
            sort: None,
        };
        saved_search_repo.create(&saved_search).await.unwrap();
        let filters: Vec<SavedSearchFilter> = filters
            .into_iter()
            .enumerate()
            .map(|(index, filter)| SavedSearchFilter {
                index: index as i64,
                filter,
            })
            .collect();
        saved_search_repo
            .replace_filters(saved_search.id, &filters)
            .await
            .unwrap();
        saved_search.id
    }

    #[tokio::test]
    async fn get_due_elements_saved_search_scope_returns_only_matching_due_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let saved_search_repo = scope.resolve::<dyn SavedSearchRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;

        let matching = create_new_card(&card_repo, "Rust ownership").await;
        let other = create_new_card(&card_repo, "French verbs").await;
        let saved_search_id =
            create_saved_search(&saved_search_repo, "Rust", vec![name_contains("Rust")]).await;

        // Act

        let due = ids(service
            .get_due_elements(Some(StudyScope::SavedSearch(saved_search_id)))
            .await
            .unwrap());

        // Assert

        assert!(due.contains(&matching));
        assert!(!due.contains(&other));
    }

    #[tokio::test]
    async fn get_due_elements_no_scope_returns_every_due_element() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;

        let first = create_new_card(&card_repo, "Rust ownership").await;
        let second = create_new_card(&card_repo, "French verbs").await;

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert!(due.contains(&first));
        assert!(due.contains(&second));
    }

    #[tokio::test]
    async fn get_due_elements_deleted_saved_search_scope_returns_every_due_element() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;

        let card = create_new_card(&card_repo, "Rust ownership").await;

        // Act

        let due = ids(service
            .get_due_elements(Some(StudyScope::SavedSearch(Uuid::new_v4())))
            .await
            .unwrap());

        // Assert

        assert!(due.contains(&card));
    }

    #[tokio::test]
    async fn get_due_elements_custom_scope_returns_only_matching_due_elements() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;

        let matching = create_new_card(&card_repo, "Rust ownership").await;
        let other = create_new_card(&card_repo, "French verbs").await;

        // Act

        let due = ids(service
            .get_due_elements(Some(StudyScope::Custom(vec![name_contains("Rust")])))
            .await
            .unwrap());

        // Assert

        assert!(due.contains(&matching));
        assert!(!due.contains(&other));
    }

    fn ids(due: Vec<DueElement>) -> Vec<ElementId> {
        due.into_iter().map(|entry| entry.element_id).collect()
    }

    fn ordered_entries(count: usize) -> Vec<DueElement> {
        let mut priority = FractionalIndex::default();
        let mut entries = Vec::with_capacity(count);
        entries.push(DueElement {
            element_id: ElementId::Card(Uuid::new_v4()),
            name: String::new(),
            priority: priority.clone(),
        });
        for _ in 1..count {
            priority = FractionalIndex::new_after(&priority);
            entries.push(DueElement {
                element_id: ElementId::Card(Uuid::new_v4()),
                name: String::new(),
                priority: priority.clone(),
            });
        }
        entries
    }

    #[test]
    fn order_by_priority_with_fuzz_zero_fuzz_keeps_exact_priority_order() {
        // Arrange

        let entries = ordered_entries(20);
        let expected: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let actual = ids(order_by_priority_with_fuzz(entries, 0, day));

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn order_by_priority_with_fuzz_hundred_fuzz_keeps_same_set_of_elements() {
        // Arrange

        let entries = ordered_entries(20);
        let mut expected: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let mut actual = ids(order_by_priority_with_fuzz(entries, 100, day));

        // Assert

        expected.sort_by_key(|id| id.id());
        actual.sort_by_key(|id| id.id());
        assert_eq!(expected, actual);
    }

    #[test]
    fn order_by_priority_with_fuzz_moderate_fuzz_never_moves_items_out_of_their_bracket() {
        // Arrange

        let entries = ordered_entries(20);
        let expected: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let actual = ids(order_by_priority_with_fuzz(entries, 25, day));

        // Assert

        let bracket_size = 5;
        for (bracket_index, chunk) in actual.chunks(bracket_size).enumerate() {
            let expected_chunk =
                &expected[bracket_index * bracket_size..bracket_index * bracket_size + chunk.len()];
            let mut sorted_chunk = chunk.to_vec();
            let mut sorted_expected_chunk = expected_chunk.to_vec();
            sorted_chunk.sort_by_key(|id| id.id());
            sorted_expected_chunk.sort_by_key(|id| id.id());
            assert_eq!(sorted_expected_chunk, sorted_chunk);
        }
    }

    #[test]
    fn order_by_priority_with_fuzz_same_day_returns_the_same_order() {
        // Arrange

        let entries = ordered_entries(20);
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let first = ids(order_by_priority_with_fuzz(entries.clone(), 100, day));
        let second = ids(order_by_priority_with_fuzz(entries, 100, day));

        // Assert

        assert_eq!(first, second);
    }

    #[test]
    fn order_by_priority_with_fuzz_next_day_returns_a_different_order() {
        // Arrange

        let entries = ordered_entries(20);
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let today = ids(order_by_priority_with_fuzz(entries.clone(), 100, day));
        let tomorrow = ids(order_by_priority_with_fuzz(
            entries,
            100,
            day.succ_opt().unwrap(),
        ));

        // Assert

        assert_ne!(today, tomorrow);
    }
}
