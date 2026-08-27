use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceService;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_details_service::{
    ElementDetails, ElementDetailsError, ElementDetailsService,
};
use crate::elements::services::priority_service::PriorityService;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::profile_resolution_service::{ProfileResolutionService, ProfileSource};
use crate::study::services::study_profile_service::StudyProfileService;

#[derive(ScopeInjectable)]
pub struct DefaultElementDetailsService {
    meta_repository: Arc<dyn MetaRepository>,
    bibliographical_source_service: Arc<dyn BibliographicalSourceService>,
    card_review_repository: Arc<dyn CardReviewRepository>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    study_profile_service: Arc<dyn StudyProfileService>,
    priority_service: Arc<dyn PriorityService>,
}

#[async_trait]
impl ElementDetailsService for DefaultElementDetailsService {
    async fn get_element_details(
        &self,
        element_id: ElementId,
    ) -> Result<ElementDetails, ElementDetailsError> {
        let meta = self.meta_repository.get_by_id(element_id.id()).await?;

        let bibliographical_source = match meta.bibliographical_source_id {
            Some(bibliographical_source_id) => Some(
                self.bibliographical_source_service
                    .get_bibliographical_source(bibliographical_source_id)
                    .await?,
            ),
            None => None,
        };

        let derived_from_name = match meta.derived_from {
            Some(derived_from) => Some(
                self.meta_repository
                    .get_by_id(derived_from.id())
                    .await?
                    .name,
            ),
            None => None,
        };

        let card_review = if matches!(element_id, ElementId::Card(_)) {
            self.card_review_repository
                .get_by_card_id(element_id.id())
                .await?
        } else {
            None
        };

        let learning_asset_review = if matches!(
            element_id,
            ElementId::LearningAsset(_) | ElementId::Extract(_)
        ) {
            self.learning_asset_review_repository
                .get_by_element_id(element_id.id())
                .await?
        } else {
            None
        };

        let effective_profile = self
            .profile_resolution_service
            .resolve_effective_profile(element_id)
            .await?;
        let profiles = self.study_profile_service.list_profiles().await?;
        let priority = self.priority_service.get_priority_info(element_id).await?;

        let inherited_profile_name = match effective_profile.source {
            ProfileSource::Direct => match meta.parent {
                Some(parent) => {
                    let parent_effective = self
                        .profile_resolution_service
                        .resolve_effective_profile(parent)
                        .await?;
                    Some(parent_effective.profile.name)
                }
                None => profiles
                    .iter()
                    .find(|profile| profile.is_default)
                    .map(|profile| profile.name.clone()),
            },
            _ => Some(effective_profile.profile.name.clone()),
        };

        Ok(ElementDetails {
            bibliographical_source,
            derived_from_name,
            card_review,
            learning_asset_review,
            effective_profile,
            profiles,
            inherited_profile_name,
            priority,
        })
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::services::implementations::default_priority_service::DefaultPriorityService;
    use crate::elements::services::priority_service::PriorityService;
    use crate::{
        bibliographical_sources::{
            repositories::bibliographical_source_repository::BibliographicalSourceRepository,
            services::bibliographical_source_service::BibliographicalSourceFields,
            services::implementations::default_bibliographical_source_service::DefaultBibliographicalSourceService,
            value_objects::bibliographical_source_type::BibliographicalSourceType,
        },
        elements::{
            entities::card::Card, repositories::card_repository::CardRepository,
            value_objects::meta::Meta,
        },
        infrastructure::repositories::sqlite::{
            sqlite_bibliographical_source_repository::SqliteBibliographicalSourceRepository,
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::{
            entities::{
                card_review::CardReview, learning_asset_review::LearningAssetReview,
                study_profile::StudyProfile,
            },
            repositories::study_profile_repository::StudyProfileRepository,
            services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
            services::implementations::default_study_profile_service::DefaultStudyProfileService,
            value_objects::card_state::CardState,
        },
        test_utils::create_test_injector,
    };

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn BibliographicalSourceRepository,
            SqliteBibliographicalSourceRepository
        );
        register_scope!(
            injector,
            dyn BibliographicalSourceService,
            DefaultBibliographicalSourceService
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
        register_scope!(
            injector,
            dyn StudyProfileService,
            DefaultStudyProfileService
        );
        register_scope!(injector, dyn PriorityService, DefaultPriorityService);
        register_scope!(
            injector,
            dyn ElementDetailsService,
            DefaultElementDetailsService
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

    fn make_profile(is_default: bool) -> StudyProfile {
        let now = Utc::now();
        StudyProfile {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: if is_default { "Default" } else { "Custom" }.to_string(),
            is_default,
            desired_retention: 0.9,
            fsrs_params: None,
            learning_steps: None,
            relearning_steps: None,
            initial_interval_multiplier: 1.2,
            initial_interval_days: 1.0,
            min_interval_days: 1.0,
        }
    }

    #[tokio::test]
    async fn get_element_details_element_with_no_bibliographical_source_or_parent_returns_empty_details()
     {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        let default_profile = make_profile(true);
        profile_repo.create(&default_profile).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(folder_id, None))
            .await
            .unwrap();

        // Act

        let details = service.get_element_details(folder_id).await.unwrap();

        // Assert

        assert!(details.bibliographical_source.is_none());
        assert!(details.derived_from_name.is_none());
        assert!(details.card_review.is_none());
        assert!(details.learning_asset_review.is_none());
        assert_eq!(details.inherited_profile_name, Some("Default".to_string()));
    }

    #[tokio::test]
    async fn get_element_details_element_with_bibliographical_source_returns_resolved_bibliographical_source()
     {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let bibliographical_source_service =
            scope.resolve::<dyn BibliographicalSourceService>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        profile_repo.create(&make_profile(true)).await.unwrap();

        let bibliographical_source = bibliographical_source_service
            .create_or_reuse_bibliographical_source(BibliographicalSourceFields {
                title: "My bibliographical source".into(),
                authors: None,
                publication_date: None,
                source_type: BibliographicalSourceType::File,
                location: None,
            })
            .await
            .unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                bibliographical_source_id: Some(bibliographical_source.id),
                ..make_meta(folder_id, None)
            })
            .await
            .unwrap();

        // Act

        let details = service.get_element_details(folder_id).await.unwrap();

        // Assert

        assert_eq!(
            details
                .bibliographical_source
                .unwrap()
                .bibliographical_source
                .id,
            bibliographical_source.id
        );
    }

    #[tokio::test]
    async fn get_element_details_element_with_derived_from_returns_derived_from_name() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        profile_repo.create(&make_profile(true)).await.unwrap();

        let bibliographical_source_id = ElementId::LearningAsset(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                name: "BibliographicalSource Learning Asset".into(),
                ..make_meta(bibliographical_source_id, None)
            })
            .await
            .unwrap();

        let extract_id = ElementId::Extract(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                derived_from: Some(bibliographical_source_id),
                ..make_meta(extract_id, None)
            })
            .await
            .unwrap();

        // Act

        let details = service.get_element_details(extract_id).await.unwrap();

        // Assert

        assert_eq!(
            details.derived_from_name,
            Some("BibliographicalSource Learning Asset".to_string())
        );
    }

    #[tokio::test]
    async fn get_element_details_card_with_review_returns_card_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repo = scope.resolve::<dyn CardRepository>().await;
        let card_review_repo = scope.resolve::<dyn CardReviewRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        profile_repo.create(&make_profile(true)).await.unwrap();

        let card_id = ElementId::Card(Uuid::new_v4());
        card_repo
            .create(Card {
                meta: make_meta(card_id, None),
                front: String::new(),
                back: String::new(),
            })
            .await
            .unwrap();
        card_review_repo
            .upsert(&CardReview {
                card_id: card_id.id(),
                due: Utc::now() + Duration::days(1),
                stability: 2.0,
                difficulty: 3.0,
                reps: 1,
                lapses: 0,
                state: CardState::Review,
                last_reviewed: Some(Utc::now()),
                scheduled_days: 0,
                learning_steps: 0,
            })
            .await
            .unwrap();

        // Act

        let details = service.get_element_details(card_id).await.unwrap();

        // Assert

        assert_eq!(details.card_review.unwrap().card_id, card_id.id());
        assert!(details.learning_asset_review.is_none());
    }

    #[tokio::test]
    async fn get_element_details_learning_asset_with_review_returns_learning_asset_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let learning_asset_review_repo = scope.resolve::<dyn LearningAssetReviewRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        profile_repo.create(&make_profile(true)).await.unwrap();

        let learning_asset_id = ElementId::LearningAsset(Uuid::new_v4());
        meta_repo
            .create_meta(&make_meta(learning_asset_id, None))
            .await
            .unwrap();
        learning_asset_review_repo
            .upsert(&LearningAssetReview {
                element_id: learning_asset_id,
                due: Utc::now() + Duration::days(5),
                interval_days: 5.0,
                last_reviewed: Some(Utc::now()),
                finished_at: None,
            })
            .await
            .unwrap();

        // Act

        let details = service
            .get_element_details(learning_asset_id)
            .await
            .unwrap();

        // Assert

        assert!(details.card_review.is_none());
        assert_eq!(
            details.learning_asset_review.unwrap().element_id,
            learning_asset_id
        );
    }

    #[tokio::test]
    async fn get_element_details_direct_profile_with_parent_returns_parent_name_as_inherited() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        let default_profile = make_profile(true);
        profile_repo.create(&default_profile).await.unwrap();
        let parent_profile = make_profile(false);
        profile_repo.create(&parent_profile).await.unwrap();

        let parent_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(parent_profile.id),
                ..make_meta(parent_id, None)
            })
            .await
            .unwrap();

        let own_profile = make_profile(false);
        profile_repo.create(&own_profile).await.unwrap();
        let child_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(own_profile.id),
                ..make_meta(child_id, Some(parent_id))
            })
            .await
            .unwrap();

        // Act

        let details = service.get_element_details(child_id).await.unwrap();

        // Assert

        assert_eq!(details.inherited_profile_name, Some(parent_profile.name));
    }

    #[tokio::test]
    async fn get_element_details_inherited_profile_returns_own_profile_name_as_inherited() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let service = scope.resolve::<dyn ElementDetailsService>().await;

        profile_repo.create(&make_profile(true)).await.unwrap();
        let parent_profile = make_profile(false);
        profile_repo.create(&parent_profile).await.unwrap();

        let parent_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                study_profile_id: Some(parent_profile.id),
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

        let details = service.get_element_details(child_id).await.unwrap();

        // Assert

        assert_eq!(details.inherited_profile_name, Some(parent_profile.name));
    }
}
