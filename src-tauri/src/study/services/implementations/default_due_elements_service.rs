#[cfg(test)]
use crate::elements::value_objects::reading_position::ReadingPosition;
use std::collections::{HashMap, HashSet};
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
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::repositories::learning_asset_skip_repository::LearningAssetSkipRepository;
use crate::study::repositories::study_profile_repository::StudyProfileRepository;
use crate::study::services::due_elements_service::DueElementsService;
use crate::study::services::profile_resolution_service::{
    ProfileResolutionError, ProfileResolutionService,
};
use crate::study::utils::day_boundary::{local_date, start_of_today_utc};
use crate::study::value_objects::due_element::DueElement;
use crate::study::value_objects::fuzz_factor_configuration::{
    FUZZ_FACTOR_CONFIGURATION_NAME, FuzzFactorConfiguration,
};
use crate::study::value_objects::study_scope::StudyScope;

#[derive(ScopeInjectable)]
pub struct DefaultDueElementsService {
    card_review_repository: Arc<dyn CardReviewRepository>,
    card_review_log_repository: Arc<dyn CardReviewLogRepository>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    learning_asset_skip_repository: Arc<dyn LearningAssetSkipRepository>,
    meta_repository: Arc<dyn MetaRepository>,
    saved_search_repository: Arc<dyn SavedSearchRepository>,
    search_repository: Arc<dyn SearchRepository>,
    synced_configuration_repository: Arc<dyn SyncedConfigurationRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    study_profile_repository: Arc<dyn StudyProfileRepository>,
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

    /// Applies each profile's sibling burying and daily new-card limit in one walk, so a new card the
    /// limit drops never buries its siblings, and a buried one frees its slot for another.
    async fn apply_daily_rules(
        &self,
        ordered: Vec<DueElement>,
    ) -> Result<Vec<DueElement>, ProfileResolutionError> {
        let new_count = ordered.iter().filter(|entry| entry.is_new_card).count();
        let any_buryable = ordered.iter().any(buryable);
        if new_count == 0 && !any_buryable {
            return Ok(ordered);
        }

        // Created first if missing (e.g. a database filled by a sync pull), so it's among the rules.
        let default_id = self
            .profile_resolution_service
            .resolve_profile(None)
            .await?
            .id;
        let mut rules: HashMap<Uuid, DailyRule> = self
            .study_profile_repository
            .get_all()
            .await?
            .into_iter()
            .map(|profile| {
                let rule = DailyRule {
                    bury_new: profile.bury_new_siblings,
                    bury_review: profile.bury_review_siblings,
                    new_left: profile.new_cards_per_day,
                };
                (profile.id, rule)
            })
            .collect();
        let burying = any_buryable && rules.values().any(DailyRule::buries_any);
        let limiting = new_count > 0
            && self
                .take_introduced(&mut rules, default_id, new_count)
                .await?;
        if !burying && !limiting {
            return Ok(ordered);
        }

        // With one profile every card uses it, so there's nothing to resolve.
        let profile_of = if rules.len() == 1 {
            HashMap::new()
        } else {
            let included = |entry: &DueElement| {
                (limiting && entry.is_new_card) || (burying && buryable(entry))
            };
            self.card_profiles(&ordered, included, default_id).await?
        };
        let reviewed = if burying {
            self.card_review_log_repository
                .get_sibling_reviews_since(start_of_today_utc())
                .await?
        } else {
            Vec::new()
        };
        Ok(keep_daily_cards(
            ordered,
            |card_id| profile_of.get(&card_id).copied(),
            rules,
            &reviewed,
            default_id,
        ))
    }

    /// Takes the cards introduced today off their profiles' allowances, and returns whether one could
    /// run out with `new_count` new cards due, as resolving every new card's profile is costly.
    async fn take_introduced(
        &self,
        rules: &mut HashMap<Uuid, DailyRule>,
        default_id: Uuid,
        new_count: usize,
    ) -> Result<bool, ProfileResolutionError> {
        let introduced = self
            .card_review_log_repository
            .get_cards_first_reviewed_since(start_of_today_utc())
            .await?;
        if rules.len() == 1 {
            for rule in rules.values_mut() {
                rule.new_left = rule.new_left.saturating_sub(introduced.len() as u32);
            }
        } else {
            let introduced_profiles = self
                .profile_resolution_service
                .resolve_profile_ids(&introduced)
                .await?;
            for profile_id in introduced_profiles.values() {
                let profile_id = known_or_default(rules, *profile_id, default_id);
                if let Some(rule) = rules.get_mut(&profile_id) {
                    rule.new_left = rule.new_left.saturating_sub(1);
                }
            }
        }
        let smallest = rules.values().map(|rule| rule.new_left).min().unwrap_or(0);
        Ok(new_count > smallest as usize)
    }

    /// Each `included` card's effective profile: its own, else its parent's, resolved once per parent, as
    /// a big import puts thousands of cards in each deck.
    async fn card_profiles(
        &self,
        entries: &[DueElement],
        included: impl Fn(&DueElement) -> bool,
        default_id: Uuid,
    ) -> Result<HashMap<Uuid, Uuid>, ProfileResolutionError> {
        let cards = entries.iter().filter(|entry| included(entry));
        let parents: Vec<Uuid> = cards
            .clone()
            .filter(|entry| entry.study_profile_id.is_none())
            .filter_map(|entry| entry.parent_id)
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let parent_profiles = self
            .profile_resolution_service
            .resolve_profile_ids(&parents)
            .await?;

        Ok(cards
            .map(|entry| {
                let profile_id = entry
                    .study_profile_id
                    .or_else(|| parent_profiles.get(&entry.parent_id?).copied())
                    .unwrap_or(default_id);
                (entry.element_id.id(), profile_id)
            })
            .collect())
    }
}

#[async_trait]
impl DueElementsService for DefaultDueElementsService {
    async fn get_due_elements(
        &self,
        scope: Option<StudyScope>,
    ) -> Result<Vec<DueElement>, ProfileResolutionError> {
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
        let ordered = self.apply_daily_rules(ordered).await?;

        let skipped = self
            .learning_asset_skip_repository
            .get_skipped_since(start_of_today_utc())
            .await?;
        Ok(defer_skipped(ordered, &skipped))
    }
}

/// A profile's rules for today's queue: which siblings it buries, and how many new cards it has left.
#[derive(Debug, Clone, Copy)]
struct DailyRule {
    bury_new: bool,
    bury_review: bool,
    new_left: u32,
}

impl DailyRule {
    fn buries_any(&self) -> bool {
        self.bury_new || self.bury_review
    }

    fn buries(&self, entry: &DueElement) -> bool {
        (entry.is_new_card && self.bury_new) || (entry.is_review_card && self.bury_review)
    }
}

/// A new or review card in a sibling group, the only kinds burying holds back.
fn buryable(entry: &DueElement) -> bool {
    entry.sibling_group.is_some() && (entry.is_new_card || entry.is_review_card)
}

/// Drops, in queue order, cards buried behind a sibling reviewed today (`reviewed`: `(group, card)`) or
/// kept ahead by a burying profile, then new cards past their allowance; unknown profiles use the default's.
fn keep_daily_cards(
    mut entries: Vec<DueElement>,
    profile_of: impl Fn(Uuid) -> Option<Uuid>,
    mut rules: HashMap<Uuid, DailyRule>,
    reviewed: &[(Uuid, Uuid)],
    default_id: Uuid,
) -> Vec<DueElement> {
    let reviewed_groups: HashSet<Uuid> = reviewed.iter().map(|(group, _)| *group).collect();
    // A card seen today is due again on purpose (moved back, or a short interval), so it's never buried.
    let reviewed_cards: HashSet<Uuid> = reviewed.iter().map(|(_, card_id)| *card_id).collect();
    let mut shown = HashSet::new();
    entries.retain(|entry| {
        let id = entry.element_id.id();
        let profile_id = known_or_default(&rules, profile_of(id).unwrap_or(default_id), default_id);
        let Some(rule) = rules.get_mut(&profile_id) else {
            return true;
        };
        if let Some(group) = entry.sibling_group
            && !reviewed_cards.contains(&id)
            && (shown.contains(&group) || reviewed_groups.contains(&group))
            && rule.buries(entry)
        {
            return false;
        }
        if entry.is_new_card {
            if rule.new_left == 0 {
                return false;
            }
            rule.new_left -= 1;
        }
        if let Some(group) = entry.sibling_group
            && buryable(entry)
            && rule.buries_any()
        {
            shown.insert(group);
        }
        true
    });
    entries
}

/// `profile_id` when it has rules, else the default profile, which inherits its cards.
fn known_or_default(rules: &HashMap<Uuid, DailyRule>, profile_id: Uuid, default_id: Uuid) -> Uuid {
    if rules.contains_key(&profile_id) {
        profile_id
    } else {
        default_id
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

    // Ranks in one walk along both sorted lists: a binary search per entry misses the cache on most steps.
    entries.sort_unstable_by(|a, b| a.priority.as_bytes().cmp(b.priority.as_bytes()));
    let mut rank = 0;
    let mut keyed: Vec<(u64, DueElement)> = entries
        .into_iter()
        .map(|entry| {
            while priorities
                .get(rank)
                .is_some_and(|priority| priority.as_slice() < entry.priority.as_bytes())
            {
                rank += 1;
            }
            let nudge = unit_interval(day_shuffle_key(day, &entry.element_id)) * total;
            let key = (1.0 - fuzz) * rank as f64 + fuzz * nudge;
            (key.to_bits(), entry)
        })
        .collect();
    // Stable, so entries with equal keys stay in priority order.
    keyed.sort_by_key(|(key, _)| *key);
    keyed.into_iter().map(|(_, entry)| entry).collect()
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
            entities::{card::Card, extract::Extract, learning_asset::LearningAsset},
            repositories::{
                card_repository::CardRepository, extract_repository::ExtractRepository,
                learning_asset_repository::LearningAssetRepository,
                meta_repository::MetaRepository,
            },
            value_objects::{learning_asset_content::LearningAssetContent, meta::Meta},
        },
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_log_repository::SqliteCardReviewLogRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_learning_asset_skip_repository::SqliteLearningAssetSkipRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
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
        study::entities::card_review::CardReview,
        study::entities::card_review_log::CardReviewLog,
        study::entities::learning_asset_review::LearningAssetReview,
        study::entities::study_profile::StudyProfile,
        study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
        study::value_objects::card_state::CardState,
        study::value_objects::rating::Rating,
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
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
        register_scope!(
            injector,
            dyn CardReviewLogRepository,
            SqliteCardReviewLogRepository
        );
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn ProfileResolutionService,
            DefaultProfileResolutionService
        );
        register_scope!(injector, dyn DueElementsService, DefaultDueElementsService);
        injector
    }

    /// Creates never-reviewed cards in priority order, the first highest.
    async fn create_new_cards(card_repo: &Arc<dyn CardRepository>, count: usize) -> Vec<ElementId> {
        let mut priority = FractionalIndex::default();
        let mut card_ids = Vec::with_capacity(count);
        for _ in 0..count {
            let card_id = ElementId::Card(Uuid::new_v4());
            card_repo
                .create(Card {
                    meta: Meta {
                        priority: priority.clone(),
                        ..make_meta(card_id)
                    },
                    front: String::new(),
                    back: String::new(),
                })
                .await
                .unwrap();
            card_ids.push(card_id);
            priority = FractionalIndex::new_after(&priority);
        }
        card_ids
    }

    /// Creates an extract, not due, with `count` never-reviewed cards under it, in priority order.
    async fn create_sibling_cards(
        scope: &injector::injector_scope::InjectorScope<'_>,
        count: usize,
    ) -> Vec<ElementId> {
        let extract_repo = scope.resolve::<dyn ExtractRepository>().await;
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let extract_id = ElementId::Extract(Uuid::new_v4());
        extract_repo
            .create(Extract {
                meta: make_meta(extract_id),
                content: String::new(),
                interval_multiplier: 1.0,
            })
            .await
            .unwrap();
        scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .upsert(&LearningAssetReview {
                element_id: extract_id,
                due: Utc::now() + Duration::days(30),
                interval_days: 30.0,
                last_reviewed: Some(Utc::now()),
                finished_at: None,
            })
            .await
            .unwrap();
        let mut priority = FractionalIndex::default();
        let mut card_ids = Vec::with_capacity(count);
        for _ in 0..count {
            let card_id = ElementId::Card(Uuid::new_v4());
            card_repo
                .create(Card {
                    meta: Meta {
                        parent: Some(extract_id),
                        priority: priority.clone(),
                        ..make_meta(card_id)
                    },
                    front: String::new(),
                    back: String::new(),
                })
                .await
                .unwrap();
            card_ids.push(card_id);
            priority = FractionalIndex::new_after(&priority);
        }
        card_ids
    }

    /// Sets whether the default profile buries new and review siblings.
    async fn set_bury_siblings(
        scope: &injector::injector_scope::InjectorScope<'_>,
        new: bool,
        review: bool,
    ) {
        let resolution = scope.resolve::<dyn ProfileResolutionService>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let profile = resolution.resolve_profile(None).await.unwrap();
        profile_repo
            .update(&StudyProfile {
                bury_new_siblings: new,
                bury_review_siblings: review,
                ..profile
            })
            .await
            .unwrap();
    }

    /// Makes the default profile let `limit` new cards in per day.
    async fn set_new_cards_per_day(
        scope: &injector::injector_scope::InjectorScope<'_>,
        limit: u32,
    ) {
        let resolution = scope.resolve::<dyn ProfileResolutionService>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let profile = resolution.resolve_profile(None).await.unwrap();
        profile_repo
            .update(&StudyProfile {
                new_cards_per_day: limit,
                ..profile
            })
            .await
            .unwrap();
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
            is_new_card: false,
            is_review_card: false,
            sibling_group: None,
            study_profile_id: None,
            parent_id: None,
        });
        for _ in 1..count {
            priority = FractionalIndex::new_after(&priority);
            entries.push(DueElement {
                element_id: ElementId::Card(Uuid::new_v4()),
                name: String::new(),
                priority: priority.clone(),
                is_new_card: false,
                is_review_card: false,
                sibling_group: None,
                study_profile_id: None,
                parent_id: None,
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

    #[tokio::test]
    async fn get_due_elements_more_new_cards_than_limit_returns_first_by_priority() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_new_cards_per_day(&scope, 2).await;
        let cards = create_new_cards(&card_repo, 3).await;

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(cards[..2], due);
    }

    #[tokio::test]
    async fn get_due_elements_bury_new_siblings_keeps_only_the_first_sibling() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_bury_siblings(&scope, true, false).await;
        let siblings = create_sibling_cards(&scope, 3).await;

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(siblings[..1], due);
    }

    #[tokio::test]
    async fn get_due_elements_bury_siblings_off_keeps_every_sibling() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_bury_siblings(&scope, false, false).await;
        let siblings = create_sibling_cards(&scope, 3).await;

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(siblings, due);
    }

    #[tokio::test]
    async fn get_due_elements_sibling_reviewed_today_buries_the_others() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_review_repo = scope.resolve::<dyn CardReviewRepository>().await;
        let log_repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_bury_siblings(&scope, true, false).await;
        let siblings = create_sibling_cards(&scope, 2).await;
        card_review_repo
            .upsert(&CardReview {
                card_id: siblings[0].id(),
                due: Utc::now() + Duration::days(3),
                stability: 3.0,
                difficulty: 5.0,
                reps: 1,
                lapses: 0,
                state: CardState::Review,
                last_reviewed: Some(Utc::now()),
                scheduled_days: 3,
                learning_steps: 0,
            })
            .await
            .unwrap();
        log_repo
            .create(&CardReviewLog {
                id: Uuid::new_v4(),
                card_id: Some(siblings[0].id()),
                reviewed_at: Utc::now(),
                rating: Rating::Good,
                duration_ms: None,
            })
            .await
            .unwrap();

        // Act

        let due = service.get_due_elements(None).await.unwrap();

        // Assert

        assert!(due.is_empty());
    }

    #[tokio::test]
    async fn get_due_elements_buried_new_siblings_leave_their_slots_to_other_cards() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_bury_siblings(&scope, true, false).await;
        set_new_cards_per_day(&scope, 2).await;
        let siblings = create_sibling_cards(&scope, 3).await;
        let other = create_new_card(&card_repo, "other").await;

        // Act

        let due: HashSet<ElementId> = ids(service.get_due_elements(None).await.unwrap())
            .into_iter()
            .collect();

        // Assert

        // Both share the default priority, so only the set is fixed.
        assert_eq!(HashSet::from([siblings[0], other]), due);
    }

    fn sibling_entries(kinds: &[(bool, bool)], group: Uuid) -> Vec<DueElement> {
        ordered_entries(kinds.len())
            .into_iter()
            .zip(kinds)
            .map(|(entry, (is_new_card, is_review_card))| DueElement {
                is_new_card: *is_new_card,
                is_review_card: *is_review_card,
                sibling_group: Some(group),
                ..entry
            })
            .collect()
    }

    fn daily_rule(bury_new: bool, bury_review: bool, new_left: u32) -> DailyRule {
        DailyRule {
            bury_new,
            bury_review,
            new_left,
        }
    }

    /// Runs `keep_daily_cards` with every card on one profile following `rule`.
    fn keep_with_one_rule(
        entries: Vec<DueElement>,
        rule: DailyRule,
        reviewed: &[(Uuid, Uuid)],
    ) -> Vec<ElementId> {
        let profile_id = Uuid::new_v4();
        let rules = HashMap::from([(profile_id, rule)]);
        ids(keep_daily_cards(
            entries,
            |_| None,
            rules,
            reviewed,
            profile_id,
        ))
    }

    #[test]
    fn keep_daily_cards_review_card_ahead_buries_only_review_siblings() {
        // Arrange

        let group = Uuid::new_v4();
        // A review card, another review card and a new card.
        let entries = sibling_entries(&[(false, true), (false, true), (true, false)], group);
        let expected = vec![entries[0].element_id, entries[2].element_id];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &[]);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_learning_card_ahead_keeps_its_sibling() {
        // Arrange

        let group = Uuid::new_v4();
        // A learning card and a review card.
        let entries = sibling_entries(&[(false, false), (false, true)], group);
        let expected = ids(entries.clone());

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(true, true, 10), &[]);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_new_sibling_past_limit_keeps_its_review_sibling() {
        // Arrange

        let group = Uuid::new_v4();
        // A new card ahead of a review card, with no new cards left today.
        let entries = sibling_entries(&[(true, false), (false, true)], group);
        let expected = vec![entries[1].element_id];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(true, true, 0), &[]);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_buried_new_sibling_leaves_its_slot_to_another_card() {
        // Arrange

        let mut entries = sibling_entries(&[(true, false), (true, false)], Uuid::new_v4());
        entries.extend(sibling_entries(&[(true, false)], Uuid::new_v4()));
        let expected = vec![entries[0].element_id, entries[2].element_id];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(true, false, 2), &[]);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_sibling_ahead_on_non_burying_profile_keeps_the_card() {
        // Arrange

        let group = Uuid::new_v4();
        let entries = sibling_entries(&[(false, true), (false, true)], group);
        let (open_profile, burying_profile) = (Uuid::new_v4(), Uuid::new_v4());
        let profile_of = HashMap::from([
            (entries[0].element_id.id(), open_profile),
            (entries[1].element_id.id(), burying_profile),
        ]);
        let rules = HashMap::from([
            (open_profile, daily_rule(false, false, 10)),
            (burying_profile, daily_rule(false, true, 10)),
        ]);
        let expected = ids(entries.clone());

        // Act

        let actual = ids(keep_daily_cards(
            entries,
            |card_id| profile_of.get(&card_id).copied(),
            rules,
            &[],
            open_profile,
        ));

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_sibling_reviewed_today_buries_the_card() {
        // Arrange

        let group = Uuid::new_v4();
        let entries = sibling_entries(&[(false, true)], group);
        let reviewed = [(group, Uuid::new_v4())];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &reviewed);

        // Assert

        assert!(actual.is_empty());
    }

    #[test]
    fn keep_daily_cards_card_reviewed_itself_today_keeps_it() {
        // Arrange

        let group = Uuid::new_v4();
        let entries = sibling_entries(&[(false, true)], group);
        let reviewed = [(group, entries[0].element_id.id())];
        let expected = vec![entries[0].element_id];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &reviewed);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_every_sibling_reviewed_today_keeps_them_all() {
        // Arrange

        let group = Uuid::new_v4();
        // Three review cards, all reviewed today and moved back to due.
        let entries = sibling_entries(&[(false, true), (false, true), (false, true)], group);
        let reviewed: Vec<(Uuid, Uuid)> = entries
            .iter()
            .map(|entry| (group, entry.element_id.id()))
            .collect();
        let expected = ids(entries.clone());

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &reviewed);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_sibling_reviewed_today_buries_only_the_unreviewed_card() {
        // Arrange

        let group = Uuid::new_v4();
        let entries = sibling_entries(&[(false, true), (false, true)], group);
        let reviewed = [(group, entries[1].element_id.id())];
        let expected = vec![entries[1].element_id];

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &reviewed);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_other_groups_and_ungrouped_cards_keeps_them() {
        // Arrange

        let mut entries = sibling_entries(&[(false, true)], Uuid::new_v4());
        entries.extend(sibling_entries(&[(false, true)], Uuid::new_v4()));
        entries.extend(ordered_entries(1).into_iter().map(|entry| DueElement {
            is_review_card: true,
            ..entry
        }));
        let reviewed = [(Uuid::new_v4(), Uuid::new_v4())];
        let expected = ids(entries.clone());

        // Act

        let actual = keep_with_one_rule(entries, daily_rule(false, true, 10), &reviewed);

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_unknown_profile_uses_default_allowance() {
        // Arrange

        let entries: Vec<DueElement> = ordered_entries(3)
            .into_iter()
            .map(|entry| DueElement {
                is_new_card: true,
                ..entry
            })
            .collect();
        let (default_profile, deleted_profile) = (Uuid::new_v4(), Uuid::new_v4());
        let rules = HashMap::from([(default_profile, daily_rule(false, false, 1))]);
        let expected = vec![entries[0].element_id];

        // Act

        let actual = ids(keep_daily_cards(
            entries,
            |_| Some(deleted_profile),
            rules,
            &[],
            default_profile,
        ));

        // Assert

        assert_eq!(expected, actual);
    }

    #[test]
    fn keep_daily_cards_two_profiles_caps_each_separately() {
        // Arrange

        let entries: Vec<DueElement> = ordered_entries(4)
            .into_iter()
            .map(|entry| DueElement {
                is_new_card: true,
                ..entry
            })
            .collect();
        let (capped_profile, open_profile) = (Uuid::new_v4(), Uuid::new_v4());
        let profile_of: HashMap<Uuid, Uuid> = entries
            .iter()
            .enumerate()
            .map(|(index, entry)| {
                let profile = if index % 2 == 0 {
                    capped_profile
                } else {
                    open_profile
                };
                (entry.element_id.id(), profile)
            })
            .collect();
        let rules = HashMap::from([
            (capped_profile, daily_rule(false, false, 1)),
            (open_profile, daily_rule(false, false, 5)),
        ]);
        let expected = vec![
            entries[0].element_id,
            entries[1].element_id,
            entries[3].element_id,
        ];

        // Act

        let actual = ids(keep_daily_cards(
            entries,
            |card_id| profile_of.get(&card_id).copied(),
            rules,
            &[],
            capped_profile,
        ));

        // Assert

        assert_eq!(expected, actual);
    }

    #[tokio::test]
    async fn get_due_elements_no_profile_yet_caps_at_default_limit() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        let limit = crate::study::entities::study_profile::DEFAULT_NEW_CARDS_PER_DAY as usize;
        create_new_cards(&card_repo, limit + 1).await;

        // Act

        let due = service.get_due_elements(None).await.unwrap();

        // Assert

        assert_eq!(limit, due.len());
    }

    #[tokio::test]
    async fn get_due_elements_card_introduced_today_counts_against_limit() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let card_review_repo = scope.resolve::<dyn CardReviewRepository>().await;
        let log_repo = scope.resolve::<dyn CardReviewLogRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_new_cards_per_day(&scope, 2).await;
        let learned = create_new_card(&card_repo, "learned").await;
        card_review_repo
            .upsert(&CardReview {
                card_id: learned.id(),
                due: Utc::now() + Duration::days(3),
                stability: 3.0,
                difficulty: 5.0,
                reps: 1,
                lapses: 0,
                state: CardState::Review,
                last_reviewed: Some(Utc::now()),
                scheduled_days: 3,
                learning_steps: 0,
            })
            .await
            .unwrap();
        log_repo
            .create(&CardReviewLog {
                id: Uuid::new_v4(),
                card_id: Some(learned.id()),
                reviewed_at: Utc::now(),
                rating: Rating::Good,
                duration_ms: None,
            })
            .await
            .unwrap();
        let cards = create_new_cards(&card_repo, 2).await;

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(cards[..1], due);
    }

    #[tokio::test]
    async fn get_due_elements_two_profiles_caps_each_at_its_own_limit() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_new_cards_per_day(&scope, 5).await;
        let default = scope
            .resolve::<dyn ProfileResolutionService>()
            .await
            .resolve_profile(None)
            .await
            .unwrap();
        let strict = StudyProfile {
            id: Uuid::new_v4(),
            is_default: false,
            new_cards_per_day: 1,
            ..default
        };
        profile_repo.create(&strict).await.unwrap();
        let cards = create_new_cards(&card_repo, 4).await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        for card in &cards[..2] {
            meta_repo
                .set_study_profile(*card, Some(strict.id))
                .await
                .unwrap();
        }

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(vec![cards[0], cards[2], cards[3]], due);
    }

    #[tokio::test]
    async fn get_due_elements_cards_in_folder_with_profile_caps_them_at_inherited_limit() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn DueElementsService>().await;
        set_new_cards_per_day(&scope, 5).await;
        let default = scope
            .resolve::<dyn ProfileResolutionService>()
            .await
            .resolve_profile(None)
            .await
            .unwrap();
        let strict = StudyProfile {
            id: Uuid::new_v4(),
            is_default: false,
            new_cards_per_day: 1,
            ..default
        };
        profile_repo.create(&strict).await.unwrap();
        let deck = ElementId::Folder(Uuid::new_v4());
        let subdeck = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(strict.id),
                ..make_meta(deck)
            })
            .await
            .unwrap();
        meta_repo
            .create_meta(&Meta {
                parent: Some(deck),
                ..make_meta(subdeck)
            })
            .await
            .unwrap();
        let mut priority = FractionalIndex::default();
        let mut cards = Vec::new();
        for parent in [Some(subdeck), Some(subdeck), None, None] {
            let card_id = ElementId::Card(Uuid::new_v4());
            card_repo
                .create(Card {
                    meta: Meta {
                        parent,
                        priority: priority.clone(),
                        ..make_meta(card_id)
                    },
                    front: String::new(),
                    back: String::new(),
                })
                .await
                .unwrap();
            cards.push(card_id);
            priority = FractionalIndex::new_after(&priority);
        }

        // Act

        let due = ids(service.get_due_elements(None).await.unwrap());

        // Assert

        assert_eq!(vec![cards[0], cards[2], cards[3]], due);
    }
}
