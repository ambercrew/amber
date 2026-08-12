use crate::elements::value_objects::read_point::ReadPoint;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::event_manager::EventManager;
use crate::elements::dto::create_card_dto::CreateCardDto;
use crate::elements::dto::create_extract_dto::CreateExtractDto;
use crate::elements::dto::create_folder_dto::CreateFolderDto;
use crate::elements::dto::create_learning_asset_dto::CreateLearningAssetDto;
use crate::elements::entities::card::Card;
use crate::elements::entities::extract::Extract;
use crate::elements::entities::folder::Folder;
use crate::elements::entities::learning_asset::{LearningAsset, LearningAssetSplit};
use crate::elements::events::element_created_event::{
    ELEMENT_CREATED_EVENT, ElementCreatedEventDto,
};
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::folder_repository::FolderRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_creation_service::{
    ElementCreationError, ElementCreationService,
};
use crate::elements::services::element_index_service::ElementIndexService;
use crate::elements::services::priority_service::PriorityService;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;
use crate::elements::value_objects::origin::Origin;
use crate::study::entities::card_review::CardReview;
use crate::study::entities::learning_asset_review::LearningAssetReview;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::utils::day_boundary::start_of_today_utc;

#[derive(ScopeInjectable)]
pub struct DefaultElementCreationService {
    folder_repository: Arc<dyn FolderRepository>,
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
    extract_repository: Arc<dyn ExtractRepository>,
    card_repository: Arc<dyn CardRepository>,
    index_service: Arc<dyn ElementIndexService>,
    priority_service: Arc<dyn PriorityService>,
    learning_asset_review_repository: Arc<dyn LearningAssetReviewRepository>,
    card_review_repository: Arc<dyn CardReviewRepository>,
    profile_resolution_service: Arc<dyn ProfileResolutionService>,
    meta_repository: Arc<dyn MetaRepository>,
    event_manager: Arc<dyn EventManager>,
}

#[async_trait]
impl ElementCreationService for DefaultElementCreationService {
    async fn create_folder(&self, dto: CreateFolderDto) -> Result<(), ElementCreationError> {
        let parent = dto.meta.parent;
        let position = self.index_service.get_new_last_index(parent).await?;
        let priority = self.priority_service.get_new_first_priority().await?;
        let now = Utc::now();
        let (derived_from, bibliographical_source_id) =
            self.resolve_origin(parent, dto.meta.origin).await?;

        let folder = Folder {
            meta: Meta {
                element_id: ElementId::Folder(Uuid::new_v4()),
                name: dto.meta.name,
                parent,
                position,
                priority,
                study_profile_id: None,
                bibliographical_source_id,
                derived_from,
                created_at: now,
                modified_at: now,
            },
        };
        self.folder_repository.create(folder).await?;
        self.emit_element_created(parent).await;
        Ok(())
    }

    async fn create_learning_asset(
        &self,
        dto: CreateLearningAssetDto,
    ) -> Result<(), ElementCreationError> {
        let element_id = ElementId::LearningAsset(dto.id);
        let parent = dto.meta.parent;
        let position = self.index_service.get_new_last_index(parent).await?;
        let priority = self.priority_service.get_new_first_priority().await?;
        let now = Utc::now();
        let profile = self
            .profile_resolution_service
            .resolve_profile(parent)
            .await?;
        let (derived_from, bibliographical_source_id) =
            self.resolve_origin(parent, dto.meta.origin).await?;

        let learning_asset = LearningAsset {
            meta: Meta {
                element_id,
                name: dto.meta.name,
                parent,
                position,
                priority,
                study_profile_id: None,
                bibliographical_source_id,
                derived_from,
                created_at: now,
                modified_at: now,
            },
            read_point: ReadPoint::default(),
            interval_multiplier: profile.initial_interval_multiplier,
        };
        let splits = dto
            .splits
            .into_iter()
            .enumerate()
            .map(|(seq, content)| LearningAssetSplit {
                seq: seq as u32,
                content,
            })
            .collect();
        self.learning_asset_repository
            .create(learning_asset, splits)
            .await?;
        self.ensure_learning_asset_review(element_id, profile)
            .await?;
        self.emit_element_created(parent).await;
        Ok(())
    }

    async fn create_extract(&self, dto: CreateExtractDto) -> Result<(), ElementCreationError> {
        let element_id = ElementId::Extract(dto.id);
        let parent = dto.meta.parent;
        let position = self.index_service.get_new_last_index(parent).await?;
        let (derived_from, bibliographical_source_id) =
            self.resolve_origin(parent, dto.meta.origin).await?;
        // Extracted text inherits the priority of the element it was pulled
        // from, so the reader isn't forced to re-triage every extract.
        let priority = match derived_from {
            Some(source) => self.priority_service.get_inherited_priority(source).await?,
            None => self.priority_service.get_new_first_priority().await?,
        };
        let now = Utc::now();
        let profile = self
            .profile_resolution_service
            .resolve_profile(parent)
            .await?;

        let extract = Extract {
            meta: Meta {
                element_id,
                name: dto.meta.name,
                parent,
                position,
                priority,
                study_profile_id: None,
                bibliographical_source_id,
                derived_from,
                created_at: now,
                modified_at: now,
            },
            content: dto.content,
            interval_multiplier: profile.initial_interval_multiplier,
        };
        self.extract_repository.create(extract).await?;
        // Extracts are reviewed like learning_assets.
        self.ensure_learning_asset_review(element_id, profile)
            .await?;
        self.emit_element_created(parent).await;
        Ok(())
    }

    async fn create_card(&self, dto: CreateCardDto) -> Result<(), ElementCreationError> {
        let element_id = ElementId::Card(dto.id);
        let parent = dto.meta.parent;
        let position = self.index_service.get_new_last_index(parent).await?;
        let priority = self.priority_service.get_new_first_priority().await?;
        let now = Utc::now();
        let (derived_from, bibliographical_source_id) =
            self.resolve_origin(parent, dto.meta.origin).await?;

        let card = Card {
            meta: Meta {
                element_id,
                name: dto.meta.name,
                parent,
                position,
                priority,
                study_profile_id: None,
                bibliographical_source_id,
                derived_from,
                created_at: now,
                modified_at: now,
            },
            front: dto.front,
            back: dto.back,
        };
        self.card_repository.create(card).await?;
        self.ensure_card_review(dto.id, element_id).await?;
        self.emit_element_created(parent).await;
        Ok(())
    }
}

impl DefaultElementCreationService {
    async fn emit_element_created(&self, parent: Option<ElementId>) {
        let body = serde_json::to_value(ElementCreatedEventDto {
            parent_id: parent.map(|parent_id| parent_id.id()),
        })
        .expect("ElementCreatedEventDto always serializes");
        self.event_manager.push(ELEMENT_CREATED_EVENT, body).await;
    }

    async fn resolve_origin(
        &self,
        parent: Option<ElementId>,
        origin: Origin,
    ) -> Result<(Option<ElementId>, Option<Uuid>), ElementCreationError> {
        match origin {
            Origin::Custom {
                derived_from,
                bibliographical_source_id,
            } => Ok((derived_from, bibliographical_source_id)),
            Origin::Inherited => match parent {
                Some(parent_id) => {
                    let parent_meta = self.meta_repository.get_by_id(parent_id.id()).await?;
                    Ok((Some(parent_id), parent_meta.bibliographical_source_id))
                }
                None => Ok((None, None)),
            },
        }
    }

    async fn ensure_learning_asset_review(
        &self,
        element_id: ElementId,
        profile: StudyProfile,
    ) -> Result<(), ElementCreationError> {
        let exists = self
            .learning_asset_review_repository
            .get_by_element_id(element_id.id())
            .await?
            .is_some();
        if exists {
            return Ok(());
        }

        let review = LearningAssetReview {
            element_id,
            due: due_from_today(profile.initial_interval_days),
            interval_days: 0.0,
            last_reviewed: None,
            finished_at: None,
        };
        self.learning_asset_review_repository
            .upsert(&review)
            .await?;
        Ok(())
    }

    async fn ensure_card_review(
        &self,
        card_id: Uuid,
        element_id: ElementId,
    ) -> Result<(), ElementCreationError> {
        let exists = self
            .card_review_repository
            .get_by_card_id(card_id)
            .await?
            .is_some();
        if exists {
            return Ok(());
        }

        let profile = self
            .profile_resolution_service
            .resolve_profile(Some(element_id))
            .await?;
        let review = CardReview::new_for_profile(card_id, &profile);
        self.card_review_repository.upsert(&review).await?;
        Ok(())
    }
}

fn due_from_today(initial_interval_days: f32) -> DateTime<Utc> {
    start_of_today_utc()
        + Duration::seconds((initial_interval_days as f64 * 86400.0).round() as i64)
}

#[cfg(test)]
mod tests {
    use injector::{injector::Injector, register_scope};

    use crate::{
        common::event_manager::{EventManager, MockEventManager},
        elements::repositories::meta_repository::MetaRepository,
        elements::services::implementations::default_element_index_service::DefaultElementIndexService,
        elements::services::implementations::default_priority_service::DefaultPriorityService,
        infrastructure::repositories::sqlite::{
            sqlite_card_repository::SqliteCardRepository,
            sqlite_card_review_repository::SqliteCardReviewRepository,
            sqlite_extract_repository::SqliteExtractRepository,
            sqlite_folder_repository::SqliteFolderRepository,
            sqlite_learning_asset_repository::SqliteLearningAssetRepository,
            sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository,
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
        study::entities::study_profile::StudyProfile,
        study::repositories::study_profile_repository::StudyProfileRepository,
        study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService,
        study::value_objects::card_state::CardState,
        test_utils::create_test_injector,
    };

    use super::*;

    fn permissive_event_manager() -> Arc<dyn EventManager> {
        let mut mock = MockEventManager::new();
        mock.expect_push().returning(|_, _| Box::pin(async {}));
        Arc::new(mock)
    }

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn FolderRepository, SqliteFolderRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn ElementIndexService,
            DefaultElementIndexService
        );
        register_scope!(injector, dyn PriorityService, DefaultPriorityService);
        register_scope!(
            injector,
            dyn LearningAssetReviewRepository,
            SqliteLearningAssetReviewRepository
        );
        register_scope!(
            injector,
            dyn CardReviewRepository,
            SqliteCardReviewRepository
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
        injector
    }

    fn dto_meta(parent: Option<ElementId>) -> crate::elements::dto::create_meta_dto::CreateMetaDto {
        crate::elements::dto::create_meta_dto::CreateMetaDto {
            name: "test".into(),
            parent,
            origin: Origin::Custom {
                derived_from: None,
                bibliographical_source_id: None,
            },
        }
    }

    async fn create_test_profile(
        scope: &injector::injector_scope::InjectorScope<'_>,
        initial_interval_days: f32,
    ) -> Uuid {
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let profile = StudyProfile {
            id: Uuid::new_v4(),
            created_at: Utc::now(),
            modified_at: Utc::now(),
            name: "test".into(),
            is_default: true,
            desired_retention: 0.9,
            fsrs_params: None,
            initial_interval_multiplier: 1.2,
            initial_interval_days,
            min_interval_days: 1.0,
        };
        profile_repo.create(&profile).await.unwrap();
        profile.id
    }

    #[tokio::test]
    async fn create_learning_asset_creates_review_due_today_plus_initial_interval() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        create_test_profile(&scope, 3.0).await;
        let service = DefaultElementCreationService {
            folder_repository: scope.resolve::<dyn FolderRepository>().await,
            learning_asset_repository: scope.resolve::<dyn LearningAssetRepository>().await,
            extract_repository: scope.resolve::<dyn ExtractRepository>().await,
            card_repository: scope.resolve::<dyn CardRepository>().await,
            index_service: scope.resolve::<dyn ElementIndexService>().await,
            priority_service: scope.resolve::<dyn PriorityService>().await,
            learning_asset_review_repository: scope
                .resolve::<dyn LearningAssetReviewRepository>()
                .await,
            card_review_repository: scope.resolve::<dyn CardReviewRepository>().await,
            profile_resolution_service: scope.resolve::<dyn ProfileResolutionService>().await,
            meta_repository: scope.resolve::<dyn MetaRepository>().await,
            event_manager: permissive_event_manager(),
        };
        let dto = CreateLearningAssetDto {
            id: Uuid::new_v4(),
            meta: dto_meta(None),
            splits: Vec::new(),
        };
        let element_id = ElementId::LearningAsset(dto.id);

        // Act

        service.create_learning_asset(dto).await.unwrap();

        // Assert

        let review = scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .get_by_element_id(element_id.id())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(due_from_today(3.0), review.due);
    }

    #[tokio::test]
    async fn create_card_creates_review_due_today_plus_initial_interval() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        create_test_profile(&scope, 2.0).await;
        let service = DefaultElementCreationService {
            folder_repository: scope.resolve::<dyn FolderRepository>().await,
            learning_asset_repository: scope.resolve::<dyn LearningAssetRepository>().await,
            extract_repository: scope.resolve::<dyn ExtractRepository>().await,
            card_repository: scope.resolve::<dyn CardRepository>().await,
            index_service: scope.resolve::<dyn ElementIndexService>().await,
            priority_service: scope.resolve::<dyn PriorityService>().await,
            learning_asset_review_repository: scope
                .resolve::<dyn LearningAssetReviewRepository>()
                .await,
            card_review_repository: scope.resolve::<dyn CardReviewRepository>().await,
            profile_resolution_service: scope.resolve::<dyn ProfileResolutionService>().await,
            meta_repository: scope.resolve::<dyn MetaRepository>().await,
            event_manager: permissive_event_manager(),
        };
        let dto = CreateCardDto {
            id: Uuid::new_v4(),
            meta: dto_meta(None),
            front: String::new(),
            back: String::new(),
        };
        let card_id = dto.id;

        // Act

        service.create_card(dto).await.unwrap();

        // Assert

        let review = scope
            .resolve::<dyn CardReviewRepository>()
            .await
            .get_by_card_id(card_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(due_from_today(2.0), review.due);
        assert_eq!(CardState::New, review.state);
    }

    #[tokio::test]
    async fn create_extract_creates_learning_asset_review() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        create_test_profile(&scope, 1.0).await;
        let service = DefaultElementCreationService {
            folder_repository: scope.resolve::<dyn FolderRepository>().await,
            learning_asset_repository: scope.resolve::<dyn LearningAssetRepository>().await,
            extract_repository: scope.resolve::<dyn ExtractRepository>().await,
            card_repository: scope.resolve::<dyn CardRepository>().await,
            index_service: scope.resolve::<dyn ElementIndexService>().await,
            priority_service: scope.resolve::<dyn PriorityService>().await,
            learning_asset_review_repository: scope
                .resolve::<dyn LearningAssetReviewRepository>()
                .await,
            card_review_repository: scope.resolve::<dyn CardReviewRepository>().await,
            profile_resolution_service: scope.resolve::<dyn ProfileResolutionService>().await,
            meta_repository: scope.resolve::<dyn MetaRepository>().await,
            event_manager: permissive_event_manager(),
        };
        let dto = CreateExtractDto {
            id: Uuid::new_v4(),
            meta: dto_meta(None),
            content: String::new(),
        };
        let element_id = ElementId::Extract(dto.id);

        // Act

        service.create_extract(dto).await.unwrap();

        // Assert

        let review = scope
            .resolve::<dyn LearningAssetReviewRepository>()
            .await
            .get_by_element_id(element_id.id())
            .await
            .unwrap();
        assert!(review.is_some());
    }

    async fn create_test_profile_with_interval_multiplier(
        scope: &injector::injector_scope::InjectorScope<'_>,
        initial_interval_multiplier: f32,
    ) -> Uuid {
        let profile_repo = scope.resolve::<dyn StudyProfileRepository>().await;
        let profile = StudyProfile {
            id: Uuid::new_v4(),
            created_at: Utc::now(),
            modified_at: Utc::now(),
            name: "test".into(),
            is_default: true,
            desired_retention: 0.9,
            fsrs_params: None,
            initial_interval_multiplier,
            initial_interval_days: 1.0,
            min_interval_days: 1.0,
        };
        profile_repo.create(&profile).await.unwrap();
        profile.id
    }

    #[tokio::test]
    async fn create_learning_asset_valid_dto_seeds_interval_multiplier_from_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        create_test_profile_with_interval_multiplier(&scope, 1.5).await;
        let service = DefaultElementCreationService {
            folder_repository: scope.resolve::<dyn FolderRepository>().await,
            learning_asset_repository: scope.resolve::<dyn LearningAssetRepository>().await,
            extract_repository: scope.resolve::<dyn ExtractRepository>().await,
            card_repository: scope.resolve::<dyn CardRepository>().await,
            index_service: scope.resolve::<dyn ElementIndexService>().await,
            priority_service: scope.resolve::<dyn PriorityService>().await,
            learning_asset_review_repository: scope
                .resolve::<dyn LearningAssetReviewRepository>()
                .await,
            card_review_repository: scope.resolve::<dyn CardReviewRepository>().await,
            profile_resolution_service: scope.resolve::<dyn ProfileResolutionService>().await,
            meta_repository: scope.resolve::<dyn MetaRepository>().await,
            event_manager: permissive_event_manager(),
        };
        let dto = CreateLearningAssetDto {
            id: Uuid::new_v4(),
            meta: dto_meta(None),
            splits: Vec::new(),
        };
        let learning_asset_id = dto.id;

        // Act

        service.create_learning_asset(dto).await.unwrap();

        // Assert

        let learning_asset = scope
            .resolve::<dyn LearningAssetRepository>()
            .await
            .get_by_id(learning_asset_id)
            .await
            .unwrap();
        assert_eq!(1.5, learning_asset.interval_multiplier);
    }

    #[tokio::test]
    async fn create_extract_valid_dto_seeds_interval_multiplier_from_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        create_test_profile_with_interval_multiplier(&scope, 1.5).await;
        let service = DefaultElementCreationService {
            folder_repository: scope.resolve::<dyn FolderRepository>().await,
            learning_asset_repository: scope.resolve::<dyn LearningAssetRepository>().await,
            extract_repository: scope.resolve::<dyn ExtractRepository>().await,
            card_repository: scope.resolve::<dyn CardRepository>().await,
            index_service: scope.resolve::<dyn ElementIndexService>().await,
            priority_service: scope.resolve::<dyn PriorityService>().await,
            learning_asset_review_repository: scope
                .resolve::<dyn LearningAssetReviewRepository>()
                .await,
            card_review_repository: scope.resolve::<dyn CardReviewRepository>().await,
            profile_resolution_service: scope.resolve::<dyn ProfileResolutionService>().await,
            meta_repository: scope.resolve::<dyn MetaRepository>().await,
            event_manager: permissive_event_manager(),
        };
        let dto = CreateExtractDto {
            id: Uuid::new_v4(),
            meta: dto_meta(None),
            content: String::new(),
        };
        let extract_id = dto.id;

        // Act

        service.create_extract(dto).await.unwrap();

        // Assert

        let extract = scope
            .resolve::<dyn ExtractRepository>()
            .await
            .get_by_id(extract_id)
            .await
            .unwrap();
        assert_eq!(1.5, extract.interval_multiplier);
    }
}
