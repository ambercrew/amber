#[cfg(test)]
use crate::elements::value_objects::reading_position::ReadingPosition;
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{Datelike, NaiveDate, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::local_configurations::repositories::local_configuration_repository::LocalConfigurationRepositoryExt;
use crate::local_configurations::repositories::synced_configuration_repository::SyncedConfigurationRepository;
use crate::saved_searches::entities::saved_search_filter::ElementFilter;
use crate::saved_searches::repositories::saved_search_repository::SavedSearchRepository;
use crate::search::repositories::search_repository::SearchRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::repositories::learning_asset_skip_repository::LearningAssetSkipRepository;
use crate::study::services::due_elements_service::DueElementsService;
use crate::study::utils::day_boundary::{local_date, start_of_today_utc};
use crate::study::value_objects::due_element::DueElement;
use crate::study::value_objects::fuzz_factor_configuration::{
    FUZZ_FACTOR_CONFIGURATION_NAME, FuzzFactorConfiguration,
};
use crate::study::value_objects::study_scope::StudyScope;

#[derive(ScopeInjectable)]
pub struct DefaultDueElementsService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    learning_asset_skip_repository: Arc<dyn LearningAssetSkipRepository>,
    meta_repository: Arc<dyn MetaRepository>,
    saved_search_repository: Arc<dyn SavedSearchRepository>,
    search_repository: Arc<dyn SearchRepository>,
    synced_configuration_repository: Arc<dyn SyncedConfigurationRepository>,
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
        if due.is_empty() {
            return Ok(due);
        }

        let fuzz_factor = self
            .synced_configuration_repository
            .get_by_name::<FuzzFactorConfiguration>(FUZZ_FACTOR_CONFIGURATION_NAME)
            .await
            .ok()
            .flatten()
            .unwrap_or_default()
            .fuzz_factor;

        let priorities = self.meta_repository.get_priorities_ordered().await?;
        let ordered =
            order_by_priority_with_fuzz(due, &priorities, fuzz_factor, local_date(Utc::now()));

        let skipped = self
            .learning_asset_skip_repository
            .get_skipped_since(start_of_today_utc())
            .await?;
        Ok(defer_skipped(ordered, &skipped))
    }
}

/// Moves the elements in `skipped` (earliest skip first) to the end, in the order they were skipped.
fn defer_skipped(mut entries: Vec<DueElement>, skipped: &[Uuid]) -> Vec<DueElement> {
    if skipped.is_empty() {
        return entries;
    }
    let skip_order: HashMap<Uuid, usize> = skipped
        .iter()
        .enumerate()
        .map(|(order, id)| (*id, order))
        .collect();
    // Stable, and `None` sorts first, so the elements not skipped keep their order.
    entries.sort_by_key(|entry| skip_order.get(&entry.element_id.id()).copied());
    entries
}

/// Orders elements by rank among every live element's `priorities`, nudged per element and day by
/// `fuzz_factor` (0 exact, 100 shuffled); ranks count elements not due, so reviews never move the rest.
fn order_by_priority_with_fuzz(
    mut entries: Vec<DueElement>,
    priorities: &[Vec<u8>],
    fuzz_factor: u8,
    day: NaiveDate,
) -> Vec<DueElement> {
    let fuzz = f64::from(fuzz_factor.min(100)) / 100.0;
    let total = priorities.len() as f64;

    entries.sort_by_cached_key(|entry| {
        let rank = priorities
            .partition_point(|priority| priority.as_slice() < entry.priority.as_bytes())
            as f64;
        let nudge = unit_interval(day_shuffle_key(day, &entry.element_id)) * total;
        let key = (1.0 - fuzz) * rank + fuzz * nudge;
        (key.to_bits(), entry.priority.clone())
    });

    entries
}

/// Maps a random `u64` onto `[0, 1)`.
fn unit_interval(value: u64) -> f64 {
    (value >> 11) as f64 / (1u64 << 53) as f64
}

/// A pseudo-random value for the element on `day`, so its nudge holds all day whatever else is due.
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
            sqlite_learning_asset_skip_repository::SqliteLearningAssetSkipRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_synced_configuration_repository::SqliteSyncedConfigurationRepository,
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
            dyn LearningAssetSkipRepository,
            SqliteLearningAssetSkipRepository
        );
        register_scope!(
            injector,
            dyn SyncedConfigurationRepository,
            SqliteSyncedConfigurationRepository
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
    async fn get_due_elements_skipped_today_puts_them_last_in_skip_order() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let skip_repo = scope.resolve::<dyn LearningAssetSkipRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        let first_skipped = create_new_card(&card_repo, "first skipped").await;
        let not_skipped = create_new_card(&card_repo, "not skipped").await;
        let second_skipped = create_new_card(&card_repo, "second skipped").await;
        let now = Utc::now();
        skip_repo
            .record_skip(first_skipped.id(), now - Duration::seconds(1))
            .await
            .unwrap();
        skip_repo
            .record_skip(second_skipped.id(), now)
            .await
            .unwrap();

        // Act

        let actual = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(vec![not_skipped, first_skipped, second_skipped], actual);
    }

    #[tokio::test]
    async fn get_due_elements_skipped_before_today_keeps_it_in_place() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let skip_repo = scope.resolve::<dyn LearningAssetSkipRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        let skipped_yesterday = create_new_card(&card_repo, "skipped yesterday").await;
        let skipped_today = create_new_card(&card_repo, "skipped today").await;
        skip_repo
            .record_skip(
                skipped_yesterday.id(),
                start_of_today_utc() - Duration::hours(1),
            )
            .await
            .unwrap();
        skip_repo
            .record_skip(skipped_today.id(), Utc::now())
            .await
            .unwrap();

        // Act

        let actual = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(vec![skipped_yesterday, skipped_today], actual);
    }

    #[test]
    fn defer_skipped_skipped_elements_moves_them_last_in_skip_order() {
        // Arrange

        let entries = ordered_entries(4);
        let expected = vec![
            entries[0].element_id,
            entries[2].element_id,
            entries[3].element_id,
            entries[1].element_id,
        ];
        let skipped = vec![entries[3].element_id.id(), entries[1].element_id.id()];

        // Act

        let actual = ids(defer_skipped(entries, &skipped));

        // Assert

        assert_eq!(expected, actual);
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

    fn priorities_of(entries: &[DueElement]) -> Vec<Vec<u8>> {
        entries
            .iter()
            .map(|entry| entry.priority.as_bytes().to_vec())
            .collect()
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
        let priorities = priorities_of(&entries);
        let expected: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let actual = ids(order_by_priority_with_fuzz(entries, &priorities, 0, day));

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn order_by_priority_with_fuzz_hundred_fuzz_keeps_same_set_of_elements() {
        // Arrange

        let entries = ordered_entries(20);
        let priorities = priorities_of(&entries);
        let mut expected: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let mut actual = ids(order_by_priority_with_fuzz(entries, &priorities, 100, day));

        // Assert

        expected.sort_by_key(|id| id.id());
        actual.sort_by_key(|id| id.id());
        assert_eq!(expected, actual);
    }

    #[test]
    fn order_by_priority_with_fuzz_moderate_fuzz_never_moves_items_far_from_their_rank() {
        // Arrange

        let entries = ordered_entries(20);
        let priorities = priorities_of(&entries);
        let by_rank: Vec<ElementId> = entries.iter().map(|entry| entry.element_id).collect();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let actual = ids(order_by_priority_with_fuzz(entries, &priorities, 25, day));

        // Assert

        let rank = |id: &ElementId| by_rank.iter().position(|e| e == id).unwrap();
        // An element can only pass one less than 20 * 0.25 / 0.75 ranks behind it.
        for (index, earlier) in actual.iter().enumerate() {
            for later in &actual[index + 1..] {
                assert!((rank(earlier) as f64) - (rank(later) as f64) < 20.0 * 0.25 / 0.75);
            }
        }
    }

    #[test]
    fn order_by_priority_with_fuzz_reviewed_elements_removed_keeps_the_others_in_order() {
        // Arrange

        let entries = ordered_entries(20);
        let priorities = priorities_of(&entries);
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();
        let full = ids(order_by_priority_with_fuzz(
            entries.clone(),
            &priorities,
            25,
            day,
        ));
        let reviewed: Vec<ElementId> = full[..5].to_vec();
        let remaining: Vec<DueElement> = entries
            .into_iter()
            .filter(|entry| !reviewed.contains(&entry.element_id))
            .collect();

        // Act

        let actual = ids(order_by_priority_with_fuzz(remaining, &priorities, 25, day));

        // Assert

        assert_eq!(full[5..].to_vec(), actual);
    }

    #[test]
    fn order_by_priority_with_fuzz_same_day_returns_the_same_order() {
        // Arrange

        let entries = ordered_entries(20);
        let priorities = priorities_of(&entries);
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let first = ids(order_by_priority_with_fuzz(
            entries.clone(),
            &priorities,
            100,
            day,
        ));
        let second = ids(order_by_priority_with_fuzz(entries, &priorities, 100, day));

        // Assert

        assert_eq!(first, second);
    }

    #[test]
    fn order_by_priority_with_fuzz_next_day_returns_a_different_order() {
        // Arrange

        let entries = ordered_entries(20);
        let priorities = priorities_of(&entries);
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();

        // Act

        let today = ids(order_by_priority_with_fuzz(
            entries.clone(),
            &priorities,
            100,
            day,
        ));
        let tomorrow = ids(order_by_priority_with_fuzz(
            entries,
            &priorities,
            100,
            day.succ_opt().unwrap(),
        ));

        // Assert

        assert_ne!(today, tomorrow);
    }
}
