use std::sync::Arc;

use injector::{injector::Injector, register_scope};
use tauri::Url;
use tokio::sync::Mutex;

use crate::ai_integration::ai_state::AiState;
use crate::ai_integration::repositories::ai_repository::AiRepository;
use crate::ai_integration::services::agent_provider::AgentProvider;
use crate::ai_integration::services::ai_client_provider::AiClientProvider;
use crate::ai_integration::services::ai_streamer::AiStreamer;
use crate::ai_integration::services::chat_creator::ChatCreator;
use crate::ai_integration::services::document_uploader::DocumentUploader;
use crate::ai_integration::services::implementations::default_agent_provider::DefaultAgentProvider;
use crate::ai_integration::services::implementations::default_ai_client_provider::DefaultAiClientProvider;
use crate::ai_integration::services::implementations::default_ai_streamer::DefaultAiStreamer;
use crate::ai_integration::services::implementations::default_chat_creator::DefaultChatCreator;
use crate::ai_integration::services::implementations::default_document_uploader::DefaultDocumentUploader;
use crate::backend::services::{
    authenticator::Authenticator, implementations::default_authenticator::DefaultAuthenticator,
};
use crate::common::event_manager::EventManager;
use crate::common::request_bridge::RequestBridge;
use crate::common::services::implementations::tauri_event_manager::TauriEventManager;
use crate::common::services::implementations::tauri_lexical_json_converter::TauriLexicalJsonConverter;
use crate::common::services::lexical_json_converter::LexicalJsonConverter;
#[cfg(test)]
use crate::common::utils::create_sqlite_pool::create_sqlite_pool;
#[cfg(not(test))]
use crate::common::utils::create_sqlite_pool::create_sqlite_pool_from_location;
use crate::database::database_connection_manager::DatabaseConnectionManager;
use crate::database::transaction_manager::TransactionManager;
use crate::elements::repositories::card_repository::CardRepository;
use crate::elements::repositories::extract_repository::ExtractRepository;
use crate::elements::repositories::folder_repository::FolderRepository;
use crate::elements::repositories::meta_repository::MetaRepository;
use crate::elements::repositories::learning_asset_repository::LearningAssetRepository;
use crate::elements::services::element_creation_service::ElementCreationService;
use crate::elements::services::element_details_service::ElementDetailsService;
use crate::elements::services::element_index_service::ElementIndexService;
use crate::elements::services::element_move_service::ElementMoveService;
use crate::elements::services::element_tree_service::ElementTreeService;
use crate::elements::services::implementations::default_element_creation_service::DefaultElementCreationService;
use crate::elements::services::implementations::default_element_details_service::DefaultElementDetailsService;
use crate::elements::services::implementations::default_element_index_service::DefaultElementIndexService;
use crate::elements::services::implementations::default_element_move_service::DefaultElementMoveService;
use crate::elements::services::implementations::default_element_tree_service::DefaultElementTreeService;
use crate::elements::services::implementations::default_priority_service::DefaultPriorityService;
use crate::elements::services::priority_service::PriorityService;
use crate::generated_code;
use crate::infrastructure::clients::amber_backend_http_client::AmberBackendHttpClient;
use crate::infrastructure::managers::sqlite::sqlite_database_connection_manager::SqliteDatabaseConnectionManager;
use crate::infrastructure::managers::sqlite::sqlite_transaction_manager::SqliteTransactionManager;
use crate::infrastructure::repositories::disk::disk_secrets_repository::DiskSecretsRepository;
use crate::infrastructure::repositories::disk::disk_settings_repository::DiskSettingsRepository;
use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
use crate::infrastructure::repositories::sqlite::sqlite_card_review_log_repository::SqliteCardReviewLogRepository;
use crate::infrastructure::repositories::sqlite::sqlite_card_review_repository::SqliteCardReviewRepository;
use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
use crate::infrastructure::repositories::sqlite::sqlite_folder_repository::SqliteFolderRepository;
use crate::infrastructure::repositories::sqlite::sqlite_local_configuration_repository::SqliteLocalConfigurationRepository;
use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_repository::SqliteLearningAssetRepository;
use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_log_repository::SqliteLearningAssetReviewLogRepository;
use crate::infrastructure::repositories::sqlite::sqlite_learning_asset_review_repository::SqliteLearningAssetReviewRepository;
use crate::infrastructure::repositories::sqlite::sqlite_ai_repository::SqliteAiRepository;
use crate::infrastructure::repositories::sqlite::sqlite_bibliographical_source_repository::SqliteBibliographicalSourceRepository;
use crate::infrastructure::repositories::sqlite::sqlite_saved_search_repository::SqliteSavedSearchRepository;
use crate::infrastructure::repositories::sqlite::sqlite_search_repository::SqliteSearchRepository;
use crate::infrastructure::repositories::sqlite::sqlite_study_profile_repository::SqliteStudyProfileRepository;
use crate::infrastructure::repositories::sqlite::sqlite_sync_repository::SqliteSyncRepository;
use crate::infrastructure::repositories::sqlite::sqlite_trash_repository::SqliteTrashRepository;
use crate::infrastructure::value_objects::app_data_directory::AppDataDirectory;
use crate::infrastructure::value_objects::db_pool::DbPool;
use crate::infrastructure::value_objects::db_transaction::DbTransaction;
use crate::local_configurations::repositories::local_configuration_repository::LocalConfigurationRepository;
use crate::secrets::repositories::secrets_repository::SecretsRepository;
use crate::settings::entities::settings::Settings;
use crate::settings::repositories::settings_repository::SettingsRepository;
#[cfg(not(test))]
use crate::settings::value_objects::settings_profile::SettingsProfile;
use crate::bibliographical_sources::repositories::bibliographical_source_repository::BibliographicalSourceRepository;
use crate::bibliographical_sources::services::implementations::default_bibliographical_source_service::DefaultBibliographicalSourceService;
use crate::bibliographical_sources::services::bibliographical_source_service::BibliographicalSourceService;
use crate::saved_searches::repositories::saved_search_repository::SavedSearchRepository;
use crate::saved_searches::services::implementations::default_saved_search_service::DefaultSavedSearchService;
use crate::saved_searches::services::saved_search_service::SavedSearchService;
use crate::search::repositories::search_repository::SearchRepository;
use crate::search::services::implementations::default_search_service::DefaultSearchService;
use crate::search::services::search_service::SearchService;
use crate::study::repositories::card_review_log_repository::CardReviewLogRepository;
use crate::study::repositories::card_review_repository::CardReviewRepository;
use crate::study::repositories::learning_asset_review_log_repository::LearningAssetReviewLogRepository;
use crate::study::repositories::learning_asset_review_repository::LearningAssetReviewRepository;
use crate::study::repositories::study_profile_repository::StudyProfileRepository;
use crate::study::services::card_grading_service::CardGradingService;
use crate::study::services::due_elements_service::DueElementsService;
use crate::study::services::implementations::default_card_grading_service::DefaultCardGradingService;
use crate::study::services::implementations::default_due_elements_service::DefaultDueElementsService;
use crate::study::services::implementations::default_profile_resolution_service::DefaultProfileResolutionService;
use crate::study::services::implementations::default_learning_asset_scheduling_service::DefaultLearningAssetSchedulingService;
use crate::study::services::implementations::default_study_profile_service::DefaultStudyProfileService;
use crate::study::services::profile_resolution_service::ProfileResolutionService;
use crate::study::services::learning_asset_scheduling_service::LearningAssetSchedulingService;
use crate::study::services::study_profile_service::StudyProfileService;
use crate::sync::repositories::sync_repository::SyncRepository;
use crate::{
    backend::clients::amber_backend_client::AmberBackendClient,
    backup::services::{
        backup_service::BackupService,
        implementations::default_backup_service::DefaultBackupService,
    },
    settings::services::{
        implementations::{
            default_settings_dto_provider::DefaultSettingsDtoProvider,
            default_settings_updater::DefaultSettingsUpdater,
            default_system_fonts_provider::DefaultSystemFontsProvider,
        },
        settings_dto_provider::SettingsDtoProvider,
        settings_updater::SettingsUpdater,
        system_fonts_provider::SystemFontsProvider,
    },
    sync::{
        entities::deleted_entity::DeletedEntity,
        services::{
            implementations::default_syncer::DefaultSyncer,
            syncer::{SyncLock, Syncer},
        },
        strategies::{
            implementations::deleted_entity_strategy::DefaultDeletedEntityStrategy,
            sync_entity_strategy::SyncEntityStrategy,
        },
    },
    trash::{
        repositories::trash_repository::TrashRepository,
        services::{
            implementations::default_trash_service::DefaultTrashService,
            trash_service::TrashService,
        },
    },
};

pub async fn create_injector<R: tauri::Runtime>(
    app_data_directory: AppDataDirectory,
    app_handle: tauri::AppHandle<R>,
) -> Injector {
    let mut injector = Injector::default();

    let app_handle = Arc::new(app_handle);
    injector.register_singleton(Arc::new(RequestBridge::new(app_handle.clone())));
    injector.register_singleton(app_handle);
    register_scope!(
        injector,
        dyn LexicalJsonConverter,
        TauriLexicalJsonConverter<R>
    );
    register_scope!(injector, dyn EventManager, TauriEventManager<R>);

    #[cfg(not(test))]
    let settings = DiskSettingsRepository::get_or_create_settings(
        &app_data_directory,
        Settings::new(
            app_data_directory.get_path().clone(),
            SettingsProfile::Default,
        ),
    )
    .await
    .expect("Cannot get or create settings");

    #[cfg(test)]
    let settings = Settings::default();

    // Sqlite & Database

    #[cfg(not(test))]
    let sqlite_pool = create_sqlite_pool_from_location(&settings.database_location())
        .await
        .expect("Error connecting to Sqlite database");

    #[cfg(test)]
    let sqlite_pool = create_sqlite_pool("sqlite::memory:")
        .await
        .expect("Error connecting to Sqlite database");

    let db_pool = DbPool::new(sqlite_pool, settings.database_location().clone());
    injector.register_singleton(Arc::new(db_pool));
    register_scoped_tx(&mut injector);

    // Secret repository

    let secrets_repository: Arc<dyn SecretsRepository> =
        Arc::new(DiskSecretsRepository::new(&app_data_directory));
    injector.register_singleton::<dyn SecretsRepository>(secrets_repository.clone());

    // Backend

    #[cfg(debug_assertions)]
    let backend_url = Url::parse("http://localhost:5078").expect("Cannot construct backend url");
    #[cfg(not(debug_assertions))]
    let backend_url = Url::parse("https://api.amberapp.dev").expect("Cannot construct backend url");

    injector.register_singleton::<dyn AmberBackendClient>(Arc::new(
        AmberBackendHttpClient::new(backend_url, secrets_repository)
            .await
            .expect("Cannot create backend client"),
    ));

    // Local configuration

    register_scope!(
        injector,
        dyn LocalConfigurationRepository,
        SqliteLocalConfigurationRepository
    );

    // Elements

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
    register_scope!(injector, dyn ElementTreeService, DefaultElementTreeService);
    register_scope!(injector, dyn ElementMoveService, DefaultElementMoveService);
    register_scope!(injector, dyn PriorityService, DefaultPriorityService);
    register_scope!(
        injector,
        dyn ElementDetailsService,
        DefaultElementDetailsService
    );

    // Trash

    register_scope!(injector, dyn TrashRepository, SqliteTrashRepository);
    register_scope!(injector, dyn TrashService, DefaultTrashService);

    // Study

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
        dyn CardReviewRepository,
        SqliteCardReviewRepository
    );
    register_scope!(
        injector,
        dyn CardReviewLogRepository,
        SqliteCardReviewLogRepository
    );
    register_scope!(
        injector,
        dyn LearningAssetReviewRepository,
        SqliteLearningAssetReviewRepository
    );
    register_scope!(
        injector,
        dyn LearningAssetReviewLogRepository,
        SqliteLearningAssetReviewLogRepository
    );
    register_scope!(injector, dyn DueElementsService, DefaultDueElementsService);
    register_scope!(injector, dyn CardGradingService, DefaultCardGradingService);
    register_scope!(
        injector,
        dyn LearningAssetSchedulingService,
        DefaultLearningAssetSchedulingService
    );
    register_scope!(
        injector,
        dyn StudyProfileService,
        DefaultStudyProfileService
    );
    register_scope!(
        injector,
        dyn ElementCreationService,
        DefaultElementCreationService
    );

    // Bibliographical sources

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

    // Saved searches

    register_scope!(
        injector,
        dyn SavedSearchRepository,
        SqliteSavedSearchRepository
    );
    register_scope!(injector, dyn SavedSearchService, DefaultSavedSearchService);

    // Search

    register_scope!(injector, dyn SearchRepository, SqliteSearchRepository);
    register_scope!(injector, dyn SearchService, DefaultSearchService);

    // Settings

    injector.register_singleton(Arc::new(Mutex::new(settings)));
    register_scope!(
        injector,
        dyn SettingsDtoProvider,
        DefaultSettingsDtoProvider
    );
    register_scope!(injector, dyn SettingsUpdater, DefaultSettingsUpdater);
    register_scope!(injector, dyn SettingsRepository, DiskSettingsRepository);
    register_scope!(
        injector,
        dyn SystemFontsProvider,
        DefaultSystemFontsProvider
    );

    // Syncer

    injector.register_singleton(Arc::new(SyncLock(Mutex::new(()))));
    register_scope!(injector, dyn SyncRepository, SqliteSyncRepository);
    register_scope!(
        injector,
        dyn SyncEntityStrategy<Input = generated_code::DeletedEntity, Entity = DeletedEntity>,
        DefaultDeletedEntityStrategy
    );
    register_scope!(injector, dyn Syncer, DefaultSyncer);

    // Backup

    register_scope!(injector, dyn BackupService, DefaultBackupService);

    // AI

    injector.register_singleton(Arc::new(AiState::default()));
    register_scope!(injector, dyn AiRepository, SqliteAiRepository);
    register_scope!(injector, dyn AiClientProvider, DefaultAiClientProvider);
    register_scope!(injector, dyn ChatCreator, DefaultChatCreator);
    register_scope!(injector, dyn AgentProvider, DefaultAgentProvider);
    register_scope!(injector, dyn AiStreamer, DefaultAiStreamer);
    register_scope!(injector, dyn DocumentUploader, DefaultDocumentUploader);

    // Auth

    register_scope!(injector, dyn Authenticator, DefaultAuthenticator);
    register_scope!(
        injector,
        dyn DatabaseConnectionManager,
        SqliteDatabaseConnectionManager
    );
    register_scope!(injector, dyn TransactionManager, SqliteTransactionManager);

    // Other

    injector.register_singleton(Arc::new(app_data_directory.clone()));

    injector
}

pub fn register_scoped_tx(injector: &mut Injector) {
    injector.register_scope_factory::<DbTransaction>(|scope| {
        Box::pin(async move {
            let db_pool = scope.resolve::<DbPool>().await;
            let pool = db_pool.pool().await;
            let tx = pool.begin().await.expect("Cannot create a new transaction");
            let db_transaction = DbTransaction::new(Mutex::new(tx));
            Arc::new(db_transaction)
        })
    });
}

#[cfg(test)]
mod tests {
    use crate::{
        ai_integration::clients::mock_client::MockClient, test_utils::create_temp_directory,
    };

    use super::*;

    #[tokio::test]
    pub async fn validate_created_injector() {
        // Arrange

        let app_data_directory = AppDataDirectory::new(create_temp_directory().await);
        let app_handle = tauri::test::mock_app().handle().clone();
        let mut injector = create_injector(app_data_directory, app_handle).await;

        // Needed for testing.
        injector.register_singleton(Arc::new(MockClient::default()));

        // Act & Assert

        injector.validate().await;
    }
}
