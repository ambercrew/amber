use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::repositories::study_profile_repository::StudyProfileRepository;
use crate::study::services::profile_resolution_service::{
    EffectiveProfile, ProfileResolutionError, ProfileResolutionService, ProfileSource,
};
use crate::study::value_objects::priority_inheritance_policy::PriorityInheritancePolicy;
use crate::study::value_objects::step_unit::StepUnit;

const DEFAULT_DESIRED_RETENTION: f32 = 0.9;
const DEFAULT_INTERVAL_MULTIPLIER: f32 = 1.2;
const DEFAULT_INITIAL_INTERVAL_DAYS: f32 = 1.0;
const DEFAULT_MIN_INTERVAL_DAYS: f32 = 1.0;

/// Mirrors ts-fsrs's own `default_learning_steps`/`default_relearning_steps`.
fn default_learning_steps() -> Vec<StepUnit> {
    ["1m", "10m"]
        .into_iter()
        .map(|value| StepUnit::try_from(value.to_string()).expect("valid default step"))
        .collect()
}

fn default_relearning_steps() -> Vec<StepUnit> {
    ["10m"]
        .into_iter()
        .map(|value| StepUnit::try_from(value.to_string()).expect("valid default step"))
        .collect()
}

#[derive(ScopeInjectable)]
pub struct DefaultProfileResolutionService {
    meta_repository: Arc<dyn MetaRepository>,
    study_profile_repository: Arc<dyn StudyProfileRepository>,
}

#[async_trait]
impl ProfileResolutionService for DefaultProfileResolutionService {
    async fn resolve_profile(
        &self,
        element_id: Option<ElementId>,
    ) -> Result<StudyProfile, ProfileResolutionError> {
        match element_id {
            Some(element_id) => Ok(self.resolve_effective_profile(element_id).await?.profile),
            None => self.resolve_default_profile().await,
        }
    }

    async fn resolve_effective_profile(
        &self,
        element_id: ElementId,
    ) -> Result<EffectiveProfile, ProfileResolutionError> {
        if let Some((profile_id, source)) = self.find_inherited_profile(element_id).await? {
            let profile = self.study_profile_repository.get_by_id(profile_id).await?;
            return Ok(EffectiveProfile { profile, source });
        }

        Ok(EffectiveProfile {
            profile: self.resolve_default_profile().await?,
            source: ProfileSource::Default,
        })
    }

    async fn cards_using_profile(
        &self,
        profile_id: Uuid,
        card_ids: &[Uuid],
    ) -> Result<HashSet<Uuid>, ProfileResolutionError> {
        let is_default = self
            .study_profile_repository
            .get_default_or_oldest()
            .await?
            .is_some_and(|default| default.id == profile_id);
        let mut owners = HashMap::new();
        let mut cards = HashSet::new();
        for &card_id in card_ids {
            let found = self
                .find_profile_owner(ElementId::Card(card_id), &mut owners)
                .await?;
            let uses_profile = match found {
                Some((found_id, _)) => found_id == profile_id,
                None => is_default,
            };
            if uses_profile {
                cards.insert(card_id);
            }
        }
        Ok(cards)
    }
}

impl DefaultProfileResolutionService {
    async fn resolve_default_profile(&self) -> Result<StudyProfile, ProfileResolutionError> {
        if let Some(profile) = self
            .study_profile_repository
            .get_default_or_oldest()
            .await?
        {
            return Ok(profile);
        }

        let profile = Self::new_default_profile();
        self.study_profile_repository.create(&profile).await?;
        Ok(profile)
    }

    async fn find_inherited_profile(
        &self,
        element_id: ElementId,
    ) -> Result<Option<(Uuid, ProfileSource)>, ProfileResolutionError> {
        let found = self
            .find_profile_owner(element_id, &mut HashMap::new())
            .await?;
        Ok(found.map(|(profile_id, owner)| {
            let source = if owner == element_id {
                ProfileSource::Direct
            } else {
                ProfileSource::Inherited { from: owner }
            };
            (profile_id, source)
        }))
    }

    /// The profile of the nearest element, `element_id` itself or an ancestor, that has one,
    /// and that element. `owners` caches each walk for elements sharing ancestors.
    async fn find_profile_owner(
        &self,
        element_id: ElementId,
        owners: &mut HashMap<ElementId, Option<(Uuid, ElementId)>>,
    ) -> Result<Option<(Uuid, ElementId)>, ProfileResolutionError> {
        let mut walked = Vec::new();
        let mut current = element_id;
        let found = loop {
            if let Some(&cached) = owners.get(&current) {
                break cached;
            }
            walked.push(current);
            let meta = self.meta_repository.get_by_id(current.id()).await?;
            if let Some(profile_id) = meta.study_profile_id {
                break Some((profile_id, current));
            }
            match meta.parent {
                Some(parent) => current = parent,
                None => break None,
            }
        };
        for element in walked {
            owners.insert(element, found);
        }
        Ok(found)
    }

    fn new_default_profile() -> StudyProfile {
        let now = Utc::now();
        StudyProfile {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: "Default".to_string(),
            is_default: true,
            desired_retention: DEFAULT_DESIRED_RETENTION,
            fsrs_params: Some(fsrs::DEFAULT_PARAMETERS.to_vec()),
            learning_steps: Some(default_learning_steps()),
            relearning_steps: Some(default_relearning_steps()),
            initial_interval_multiplier: DEFAULT_INTERVAL_MULTIPLIER,
            initial_interval_days: DEFAULT_INITIAL_INTERVAL_DAYS,
            min_interval_days: DEFAULT_MIN_INTERVAL_DAYS,
            priority_inheritance_policy: PriorityInheritancePolicy::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        elements::{
            repositories::{folder_repository::FolderRepository, meta_repository::MetaRepository},
            value_objects::meta::Meta,
        },
        infrastructure::repositories::sqlite::{
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
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
        injector
    }

    fn make_meta(id: ElementId, parent: Option<ElementId>) -> Meta {
        Meta {
            element_id: id,
            name: "test".into(),
            parent,
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
    async fn resolve_profile_element_has_profile_returns_own_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let profile = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&profile).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(profile.id),
                bibliographical_source_id: None,
                derived_from: None,
                ..make_meta(folder_id, None)
            })
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_profile(Some(folder_id)).await.unwrap();

        // Assert

        assert_eq!(profile.id, resolved.id);
    }

    #[tokio::test]
    async fn resolve_profile_parent_has_profile_returns_parent_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let profile = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&profile).await.unwrap();

        let parent_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(profile.id),
                bibliographical_source_id: None,
                derived_from: None,
                ..make_meta(parent_id, None)
            })
            .await
            .unwrap();

        let child_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(child_id, Some(parent_id)))
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_profile(Some(child_id)).await.unwrap();

        // Assert

        assert_eq!(profile.id, resolved.id);
    }

    #[tokio::test]
    async fn resolve_profile_no_profile_in_chain_returns_default_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let default_profile = StudyProfile {
            is_default: true,
            ..DefaultProfileResolutionService::new_default_profile()
        };
        profile_repo.create(&default_profile).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(folder_id, None))
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_profile(Some(folder_id)).await.unwrap();

        // Assert

        assert_eq!(default_profile.id, resolved.id);
    }

    #[tokio::test]
    async fn resolve_profile_no_profiles_exist_creates_new_default_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(folder_id, None))
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_profile(Some(folder_id)).await.unwrap();

        // Assert

        assert!(resolved.is_default);
        assert_eq!(
            DEFAULT_INTERVAL_MULTIPLIER,
            resolved.initial_interval_multiplier
        );
    }

    #[tokio::test]
    async fn resolve_profile_no_element_id_returns_default_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let default_profile = StudyProfile {
            is_default: true,
            ..DefaultProfileResolutionService::new_default_profile()
        };
        profile_repo.create(&default_profile).await.unwrap();

        // Act

        let resolved = service.resolve_profile(None).await.unwrap();

        // Assert

        assert_eq!(default_profile.id, resolved.id);
    }

    #[tokio::test]
    async fn resolve_effective_profile_element_has_profile_returns_direct_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let profile = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&profile).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(profile.id),
                bibliographical_source_id: None,
                derived_from: None,
                ..make_meta(folder_id, None)
            })
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_effective_profile(folder_id).await.unwrap();

        // Assert

        assert_eq!(ProfileSource::Direct, resolved.source);
    }

    #[tokio::test]
    async fn resolve_effective_profile_parent_has_profile_returns_inherited_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let profile = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&profile).await.unwrap();

        let parent_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(profile.id),
                bibliographical_source_id: None,
                derived_from: None,
                ..make_meta(parent_id, None)
            })
            .await
            .unwrap();

        let child_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(child_id, Some(parent_id)))
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_effective_profile(child_id).await.unwrap();

        // Assert

        assert_eq!(
            ProfileSource::Inherited { from: parent_id },
            resolved.source
        );
    }

    #[tokio::test]
    async fn resolve_effective_profile_no_profile_in_chain_returns_default_source() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;

        let default_profile = StudyProfile {
            is_default: true,
            ..DefaultProfileResolutionService::new_default_profile()
        };
        profile_repo.create(&default_profile).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(folder_id, None))
            .await
            .unwrap();

        // Act

        let resolved = service.resolve_effective_profile(folder_id).await.unwrap();

        // Assert

        assert_eq!(ProfileSource::Default, resolved.source);
    }

    async fn create_meta(
        meta_repo: &Arc<dyn MetaRepository>,
        id: ElementId,
        parent: Option<ElementId>,
        study_profile_id: Option<Uuid>,
    ) {
        meta_repo
            .create_meta(&Meta {
                study_profile_id,
                ..make_meta(id, parent)
            })
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn cards_using_profile_nested_cards_returns_inherited_and_direct_cards() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;
        let default = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&default).await.unwrap();
        let profile = StudyProfile {
            id: Uuid::new_v4(),
            is_default: false,
            ..DefaultProfileResolutionService::new_default_profile()
        };
        profile_repo.create(&profile).await.unwrap();
        let folder = ElementId::Folder(Uuid::new_v4());
        create_meta(&meta_repo, folder, None, Some(profile.id)).await;
        let [inherited, overridden, direct, unassigned] = [(); 4].map(|_| Uuid::new_v4());
        create_meta(&meta_repo, ElementId::Card(inherited), Some(folder), None).await;
        create_meta(
            &meta_repo,
            ElementId::Card(overridden),
            Some(folder),
            Some(default.id),
        )
        .await;
        create_meta(&meta_repo, ElementId::Card(direct), None, Some(profile.id)).await;
        create_meta(&meta_repo, ElementId::Card(unassigned), None, None).await;

        // Act

        let cards = service
            .cards_using_profile(profile.id, &[inherited, overridden, direct, unassigned])
            .await
            .unwrap();

        // Assert

        assert_eq!(HashSet::from([inherited, direct]), cards);
    }

    #[tokio::test]
    async fn cards_using_profile_default_profile_includes_cards_without_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ProfileResolutionService>().await;
        let default = DefaultProfileResolutionService::new_default_profile();
        profile_repo.create(&default).await.unwrap();
        let unassigned = Uuid::new_v4();
        create_meta(&meta_repo, ElementId::Card(unassigned), None, None).await;

        // Act

        let cards = service
            .cards_using_profile(default.id, &[unassigned])
            .await
            .unwrap();

        // Assert

        assert_eq!(HashSet::from([unassigned]), cards);
    }
}
