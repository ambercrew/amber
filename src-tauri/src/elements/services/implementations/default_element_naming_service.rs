use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::event_manager::EventManager;
use crate::common::repository_error::RepositoryError;
use crate::elements::events::element_renamed_event::{
    ELEMENT_RENAMED_EVENT, ElementRenamedEventDto,
};
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::services::element_naming_service::ElementNamingService;
use crate::elements::utils::auto_name::auto_name;
use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::learning_asset_split_id::LearningAssetSplitId;
use crate::elements::value_objects::learning_asset_type::LearningAssetType;
use crate::elements::value_objects::name_source::NameSource;

#[derive(ScopeInjectable)]
pub struct DefaultElementNamingService {
    meta_repository: Arc<dyn MetaRepository>,
    event_manager: Arc<dyn EventManager>,
    extract_repository: Arc<dyn ExtractRepository>,
    card_repository: Arc<dyn CardRepository>,
    learning_asset_repository: Arc<dyn LearningAssetRepository>,
}

#[async_trait]
impl ElementNamingService for DefaultElementNamingService {
    async fn rename_from_content(
        &self,
        id: ElementId,
        contents: &[&str],
    ) -> Result<(), RepositoryError> {
        let created_at = self.meta_repository.get_by_id(id.id()).await?.created_at;
        let name = auto_name(contents, created_at);
        if !self.meta_repository.rename_automatically(id, &name).await? {
            return Ok(());
        }
        let body = serde_json::to_value(ElementRenamedEventDto {
            element_id: id,
            name,
        })
        .expect("ElementRenamedEventDto always serializes");
        self.event_manager.push(ELEMENT_RENAMED_EVENT, body).await;
        Ok(())
    }

    async fn set_name_source(
        &self,
        id: ElementId,
        name_source: NameSource,
    ) -> Result<(), RepositoryError> {
        self.meta_repository
            .set_name_source(id, name_source)
            .await?;
        if name_source == NameSource::Automatic {
            let contents = self.contents(id).await?;
            let contents: Vec<&str> = contents.iter().map(String::as_str).collect();
            self.rename_from_content(id, &contents).await?;
        }
        Ok(())
    }
}

impl DefaultElementNamingService {
    /// The content an element is named after, in the order `auto_name` tries it.
    async fn contents(&self, id: ElementId) -> Result<Vec<String>, RepositoryError> {
        Ok(match id {
            ElementId::Folder(_) => Vec::new(),
            ElementId::Extract(uuid) => {
                vec![self.extract_repository.get_by_id(uuid).await?.content]
            }
            ElementId::Card(uuid) => {
                let card = self.card_repository.get_by_id(uuid).await?;
                vec![card.front, card.back]
            }
            ElementId::LearningAsset(uuid) => {
                let learning_asset = self.learning_asset_repository.get_by_id(uuid).await?;
                match learning_asset.r#type {
                    LearningAssetType::Pdf => Vec::new(),
                    LearningAssetType::Extracted => vec![
                        self.learning_asset_repository
                            .get_split_content(LearningAssetSplitId {
                                learning_asset_id: uuid,
                                seq: 0,
                            })
                            .await?,
                    ],
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::{injector::Injector, register_scope};
    use serde_json::{Value, json};
    use uuid::Uuid;

    use crate::elements::entities::extract::Extract;
    use crate::elements::value_objects::meta::Meta;
    use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_repository::SqliteLearningAssetRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::test_utils::create_test_injector;

    use super::*;

    const CONTENT: &str = r#"{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"New words"}]}]}}"#;

    #[derive(Default)]
    struct RecordingEventManager {
        events: std::sync::Mutex<Vec<(String, Value)>>,
    }

    #[async_trait]
    impl EventManager for RecordingEventManager {
        async fn push(&self, name: &str, body: Value) {
            self.events.lock().unwrap().push((name.to_string(), body));
        }

        async fn emit_all(&self) {}
    }

    async fn initialize_test_injector() -> (Injector, Arc<RecordingEventManager>) {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(
            injector,
            dyn LearningAssetRepository,
            SqliteLearningAssetRepository
        );
        register_scope!(
            injector,
            dyn ElementNamingService,
            DefaultElementNamingService
        );
        let event_manager = Arc::new(RecordingEventManager::default());
        injector.register_singleton::<dyn EventManager>(event_manager.clone());
        (injector, event_manager)
    }

    async fn create_meta(repo: &Arc<dyn MetaRepository>, id: ElementId, name_source: NameSource) {
        repo.create_meta(&Meta {
            element_id: id,
            name: "Old name".into(),
            name_source,
            suspended: false,
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
    }

    #[tokio::test]
    async fn rename_from_content_automatic_name_renames_it_and_pushes_event() {
        // Arrange

        let (injector, event_manager) = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn MetaRepository>().await;
        let id = ElementId::Extract(Uuid::new_v4());
        create_meta(&repo, id, NameSource::Automatic).await;
        let service = scope.resolve::<dyn ElementNamingService>().await;

        // Act

        service.rename_from_content(id, &[CONTENT]).await.unwrap();

        // Assert

        assert_eq!("New words", repo.get_name(id).await.unwrap());
        let events = event_manager.events.lock().unwrap();
        assert_eq!(
            vec![(
                ELEMENT_RENAMED_EVENT.to_string(),
                json!({ "elementId": { "type": "extract", "id": id.id() }, "name": "New words" }),
            )],
            *events
        );
    }

    #[tokio::test]
    async fn rename_from_content_manually_named_element_keeps_name_and_pushes_nothing() {
        // Arrange

        let (injector, event_manager) = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn MetaRepository>().await;
        let id = ElementId::Extract(Uuid::new_v4());
        create_meta(&repo, id, NameSource::Manual).await;
        let service = scope.resolve::<dyn ElementNamingService>().await;

        // Act

        service.rename_from_content(id, &[CONTENT]).await.unwrap();

        // Assert

        assert_eq!("Old name", repo.get_name(id).await.unwrap());
        assert!(event_manager.events.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn set_name_source_automatic_renames_extract_after_its_content() {
        // Arrange

        let (injector, event_manager) = initialize_test_injector().await;
        let scope = injector.start_scope();
        let id = ElementId::Extract(Uuid::new_v4());
        scope
            .resolve::<dyn ExtractRepository>()
            .await
            .create(Extract {
                meta: Meta {
                    element_id: id,
                    name: "Old name".into(),
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
                },
                content: CONTENT.into(),
                interval_multiplier: 1.0,
            })
            .await
            .unwrap();
        let service = scope.resolve::<dyn ElementNamingService>().await;

        // Act

        service
            .set_name_source(id, NameSource::Automatic)
            .await
            .unwrap();

        // Assert

        let meta = scope
            .resolve::<dyn MetaRepository>()
            .await
            .get_by_id(id.id())
            .await
            .unwrap();
        assert_eq!("New words", meta.name);
        assert_eq!(NameSource::Automatic, meta.name_source);
        assert_eq!(1, event_manager.events.lock().unwrap().len());
    }

    #[tokio::test]
    async fn set_name_source_manual_keeps_current_name() {
        // Arrange

        let (injector, event_manager) = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repo = scope.resolve::<dyn MetaRepository>().await;
        let id = ElementId::Folder(Uuid::new_v4());
        create_meta(&repo, id, NameSource::Automatic).await;
        let service = scope.resolve::<dyn ElementNamingService>().await;

        // Act

        service
            .set_name_source(id, NameSource::Manual)
            .await
            .unwrap();

        // Assert

        let meta = repo.get_by_id(id.id()).await.unwrap();
        assert_eq!("Old name", meta.name);
        assert_eq!(NameSource::Manual, meta.name_source);
        assert!(event_manager.events.lock().unwrap().is_empty());
    }
}
