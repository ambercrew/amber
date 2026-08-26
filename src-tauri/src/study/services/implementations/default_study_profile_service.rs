use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use injector_derive::ScopeInjectable;
use uuid::Uuid;

use crate::common::event_manager::EventManager;
use crate::common::repository_error::RepositoryError;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::value_objects::element_id::ElementId;
use crate::study::entities::study_profile::StudyProfile;
use crate::study::events::study_profiles_changed_event::STUDY_PROFILES_CHANGED_EVENT;
use crate::study::repositories::study_profile_repository::StudyProfileRepository;
use crate::study::services::study_profile_service::{
    FSRS_PARAM_COUNT, StudyProfileFields, StudyProfileService, StudyProfileServiceError,
};

#[derive(ScopeInjectable)]
pub struct DefaultStudyProfileService {
    study_profile_repository: Arc<dyn StudyProfileRepository>,
    meta_repository: Arc<dyn MetaRepository>,
    event_manager: Arc<dyn EventManager>,
}

#[async_trait]
impl StudyProfileService for DefaultStudyProfileService {
    async fn list_profiles(&self) -> Result<Vec<StudyProfile>, RepositoryError> {
        self.study_profile_repository.get_all().await
    }

    async fn create_profile(
        &self,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError> {
        let fsrs_params = validate_fsrs_params(fields.fsrs_params)?
            .unwrap_or_else(|| fsrs::DEFAULT_PARAMETERS.to_vec());
        let now = Utc::now();
        let profile = StudyProfile {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: fields.name,
            is_default: false,
            desired_retention: fields.desired_retention,
            fsrs_params: Some(fsrs_params),
            initial_interval_multiplier: fields.initial_interval_multiplier,
            initial_interval_days: fields.initial_interval_days,
            min_interval_days: fields.min_interval_days,
        };
        self.study_profile_repository.create(&profile).await?;
        self.emit_profiles_changed().await;
        Ok(profile)
    }

    async fn update_profile(
        &self,
        id: Uuid,
        fields: StudyProfileFields,
    ) -> Result<StudyProfile, StudyProfileServiceError> {
        let existing = self.study_profile_repository.get_by_id(id).await?;
        let fsrs_params =
            validate_fsrs_params(fields.fsrs_params)?.or_else(|| existing.fsrs_params.clone());
        let profile = StudyProfile {
            name: fields.name,
            desired_retention: fields.desired_retention,
            fsrs_params,
            initial_interval_multiplier: fields.initial_interval_multiplier,
            initial_interval_days: fields.initial_interval_days,
            min_interval_days: fields.min_interval_days,
            ..existing
        };
        self.study_profile_repository.update(&profile).await?;
        self.emit_profiles_changed().await;
        Ok(profile)
    }

    async fn delete_profile(&self, id: Uuid) -> Result<(), RepositoryError> {
        self.study_profile_repository.delete(id).await?;
        self.emit_profiles_changed().await;
        Ok(())
    }

    async fn clone_profile(&self, id: Uuid) -> Result<StudyProfile, RepositoryError> {
        let existing = self.study_profile_repository.get_by_id(id).await?;
        let now = Utc::now();
        let clone = StudyProfile {
            id: Uuid::new_v4(),
            created_at: now,
            modified_at: now,
            name: format!("{} (copy)", existing.name),
            is_default: false,
            ..existing
        };
        self.study_profile_repository.create(&clone).await?;
        self.emit_profiles_changed().await;
        Ok(clone)
    }

    async fn set_default_profile(&self, id: Uuid) -> Result<StudyProfile, RepositoryError> {
        self.study_profile_repository.clear_default().await?;
        let profile = StudyProfile {
            is_default: true,
            ..self.study_profile_repository.get_by_id(id).await?
        };
        self.study_profile_repository.update(&profile).await?;
        self.emit_profiles_changed().await;
        Ok(profile)
    }

    async fn assign_profile(
        &self,
        element_id: ElementId,
        profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError> {
        self.meta_repository
            .set_study_profile(element_id, profile_id)
            .await
    }

    async fn assign_profile_many(
        &self,
        element_ids: Vec<ElementId>,
        profile_id: Option<Uuid>,
    ) -> Result<(), RepositoryError> {
        for element_id in element_ids {
            self.meta_repository
                .set_study_profile(element_id, profile_id)
                .await?;
        }
        Ok(())
    }
}

impl DefaultStudyProfileService {
    async fn emit_profiles_changed(&self) {
        self.event_manager
            .push(STUDY_PROFILES_CHANGED_EVENT, serde_json::Value::Null)
            .await;
    }
}

fn validate_fsrs_params(
    params: Option<Vec<f32>>,
) -> Result<Option<Vec<f32>>, StudyProfileServiceError> {
    match params {
        Some(params) if params.len() != FSRS_PARAM_COUNT => {
            Err(StudyProfileServiceError::InvalidFsrsParamCount {
                actual: params.len(),
            })
        }
        params => Ok(params),
    }
}

#[cfg(test)]
mod tests {
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};

    use crate::{
        common::event_manager::{EventManager, MockEventManager},
        elements::value_objects::meta::Meta,
        infrastructure::repositories::sqlite::{
            sqlite_meta_repository::SqliteMetaRepository,
            sqlite_study_profile_repository::SqliteStudyProfileRepository,
        },
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
        injector.register_singleton::<dyn EventManager>(permissive_event_manager());
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn StudyProfileService,
            DefaultStudyProfileService
        );
        injector
    }

    fn make_fields(name: &str) -> StudyProfileFields {
        StudyProfileFields {
            name: name.into(),
            desired_retention: 0.9,
            fsrs_params: None,
            initial_interval_multiplier: 1.2,
            initial_interval_days: 1.0,
            min_interval_days: 1.0,
        }
    }

    #[tokio::test]
    async fn create_profile_valid_fields_returns_non_default_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;

        // Act

        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        // Assert

        assert_eq!("Custom", profile.name);
        assert!(!profile.is_default);
    }

    #[tokio::test]
    async fn update_profile_existing_profile_changes_fields() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        // Act

        let updated = service
            .update_profile(profile.id, make_fields("Renamed"))
            .await
            .unwrap();

        // Assert

        assert_eq!("Renamed", updated.name);
    }

    #[tokio::test]
    async fn update_profile_with_fsrs_params_replaces_weights() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();
        let weights: Vec<f32> = (0..FSRS_PARAM_COUNT).map(|i| i as f32 * 0.1).collect();
        let mut fields = make_fields("Custom");
        fields.fsrs_params = Some(weights.clone());

        // Act

        let updated = service.update_profile(profile.id, fields).await.unwrap();

        // Assert

        assert_eq!(Some(weights), updated.fsrs_params);
    }

    #[tokio::test]
    async fn update_profile_with_wrong_fsrs_param_count_returns_error() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();
        let mut fields = make_fields("Custom");
        fields.fsrs_params = Some(vec![0.1, 0.2, 0.3]);

        // Act

        let result = service.update_profile(profile.id, fields).await;

        // Assert

        assert!(matches!(
            result,
            Err(StudyProfileServiceError::InvalidFsrsParamCount { actual: 3 })
        ));
    }

    #[tokio::test]
    async fn update_profile_without_fsrs_params_keeps_existing_weights() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        // Act

        let updated = service
            .update_profile(profile.id, make_fields("Renamed"))
            .await
            .unwrap();

        // Assert

        assert_eq!(profile.fsrs_params, updated.fsrs_params);
    }

    #[tokio::test]
    async fn delete_profile_existing_profile_removes_it() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        // Act

        service.delete_profile(profile.id).await.unwrap();
        let remaining = service.list_profiles().await.unwrap();

        // Assert

        assert!(!remaining.iter().any(|p| p.id == profile.id));
    }

    #[tokio::test]
    async fn clone_profile_existing_profile_creates_copy_with_new_id() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        // Act

        let clone = service.clone_profile(profile.id).await.unwrap();

        // Assert

        assert_ne!(profile.id, clone.id);
        assert_eq!("Custom (copy)", clone.name);
        assert!(!clone.is_default);
    }

    #[tokio::test]
    async fn set_default_profile_new_profile_clears_previous_default() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let first = service.create_profile(make_fields("First")).await.unwrap();
        let second = service.create_profile(make_fields("Second")).await.unwrap();
        service.set_default_profile(first.id).await.unwrap();

        // Act

        service.set_default_profile(second.id).await.unwrap();

        // Assert

        let profiles = service.list_profiles().await.unwrap();
        let first = profiles.iter().find(|p| p.id == first.id).unwrap();
        let second = profiles.iter().find(|p| p.id == second.id).unwrap();
        assert!(!first.is_default);
        assert!(second.is_default);
    }

    #[tokio::test]
    async fn assign_profile_element_sets_direct_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        let folder_id = ElementId::Folder(Uuid::new_v4());
        meta_repo
            .create_meta(&Meta {
                element_id: folder_id,
                name: "test".into(),
                parent: None,
                position: FractionalIndex::default(),
                priority: FractionalIndex::default(),
                study_profile_id: None,
                bibliographical_source_id: None,
                derived_from: None,
                created_at: Utc::now(),
                modified_at: Utc::now(),
            })
            .await
            .unwrap();

        // Act

        service
            .assign_profile(folder_id, Some(profile.id))
            .await
            .unwrap();

        // Assert

        let meta = meta_repo.get_by_id(folder_id.id()).await.unwrap();
        assert_eq!(Some(profile.id), meta.study_profile_id);
    }

    #[tokio::test]
    async fn assign_profile_many_multiple_elements_sets_profile_on_each() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let meta_repo = scope.resolve::<dyn MetaRepository>().await;
        let service = scope.resolve::<dyn StudyProfileService>().await;
        let profile = service.create_profile(make_fields("Custom")).await.unwrap();

        let make_folder = |id: ElementId| Meta {
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
        };
        let first_id = ElementId::Folder(Uuid::new_v4());
        let second_id = ElementId::Folder(Uuid::new_v4());
        meta_repo.create_meta(&make_folder(first_id)).await.unwrap();
        meta_repo
            .create_meta(&make_folder(second_id))
            .await
            .unwrap();

        // Act

        service
            .assign_profile_many(vec![first_id, second_id], Some(profile.id))
            .await
            .unwrap();

        // Assert

        let first_meta = meta_repo.get_by_id(first_id.id()).await.unwrap();
        let second_meta = meta_repo.get_by_id(second_id.id()).await.unwrap();
        assert_eq!(Some(profile.id), first_meta.study_profile_id);
        assert_eq!(Some(profile.id), second_meta.study_profile_id);
    }
}
