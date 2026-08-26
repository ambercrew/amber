mod ai_integration;
mod app_info;
mod backend;
mod backup;
mod bibliographical_sources;
mod common;
mod database;
mod elements;
mod import;
mod infrastructure;
mod local_configurations;
mod saved_searches;
mod search;
mod secrets;
mod settings;
mod study;
mod sync;
#[cfg(test)]
mod test_utils;
mod trash;

use std::sync::Arc;

use tauri::Manager;

use ai_integration::ai_api::*;
use app_info::app_info_api::*;
use backend::api::auth_api::*;
use backend::api::user_api::*;
use bibliographical_sources::bibliographical_sources_api::*;
use common::common_api::*;
use elements::elements_api::*;
use import::import_api::*;
use saved_searches::saved_search_api::*;
use search::search_api::*;
use settings::settings_api::*;
use study::study_api::*;
use study::study_profile_api::*;
use sync::sync_api::*;
use trash::trash_api::*;

#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;
use tokio::runtime::Handle;

use crate::backup::background::spawn_backup_task;
use crate::common::utils::create_injector::create_injector;
use crate::infrastructure::value_objects::app_data_directory::AppDataDirectory;
use crate::sync::bootstrap::register_sync_tables;
use crate::trash::background::spawn_trash_purge_task;

pub use common::types::SourceError;

pub mod generated_code {
    include!(concat!(env!("OUT_DIR"), "/generated_code.rs"));
}

#[cfg(feature = "cef")]
type AppRuntime = tauri::Cef;
#[cfg(not(feature = "cef"))]
type AppRuntime = tauri::Wry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    let mut tauri_builder = tauri::Builder::<AppRuntime>::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // CEF's sandbox and zygote helpers require setuid root helper binaries that
    // aren't set up in most Linux dev/AppImage environments, so CEF fails to
    // start unless these are disabled. Bake them in instead of requiring
    // `--no-sandbox --no-zygote` to be passed manually on every launch.
    #[cfg(all(feature = "cef", target_os = "linux"))]
    {
        tauri_builder = tauri_builder.command_line_args::<_, String>([
            ("--no-sandbox".to_string(), None),
            ("--no-zygote".to_string(), None),
        ]);
    }

    #[cfg(desktop)]
    {
        tauri_builder = tauri_builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }));
    }

    tauri_builder = tauri_builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    #[cfg(desktop)]
    {
        tauri_builder = tauri_builder
            .plugin(tauri_plugin_process::init())
            .plugin(
                tauri_plugin_window_state::Builder::new()
                    .with_state_flags(
                        StateFlags::SIZE
                            | StateFlags::POSITION
                            | StateFlags::MAXIMIZED
                            | StateFlags::FULLSCREEN,
                    )
                    .build(),
            )
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    tauri_builder
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Cannot get the data directory");
            let app_data_directory = AppDataDirectory::new(app_data_dir);

            let app_handle = app.handle().clone();
            let injector = Arc::new(tokio::task::block_in_place(|| {
                Handle::current().block_on(create_injector(app_data_directory, app_handle))
            }));

            app.manage(injector.clone());

            tokio::task::block_in_place(|| {
                Handle::current().block_on(register_sync_tables(&injector))
            })
            .expect("Failed to register sync tables");

            #[cfg(all(dev, desktop))]
            {
                let _ = app
                    .get_webview_window("main")
                    .expect("no main window")
                    .set_title("Amber - development");
            }

            // Starting the trash retention purge, which also runs once right away.
            spawn_trash_purge_task(injector.clone());

            // Starting the backup service.
            spawn_backup_task(injector);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            get_settings,
            update_settings,
            list_system_fonts,
            // Auth
            is_signed_in,
            resend_email_verification_code,
            sign_in,
            sign_in_with_google,
            sign_out,
            sign_up,
            update_password,
            verify_user_email,
            // User
            delete_user,
            get_user_information,
            update_user_information,
            // Elements
            get_element_tree,
            get_element_by_id,
            get_element_details,
            rename_element,
            element_exists,
            move_element,
            update_element_tags,
            add_tag_bulk,
            remove_tag_bulk,
            clear_derived_from,
            set_element_priority_by_rank,
            set_element_priority_by_percentage,
            create_folder,
            create_learning_asset,
            create_extract,
            create_card,
            update_learning_asset,
            update_read_point,
            get_learning_asset_split_manifest,
            get_learning_asset_split_content,
            get_learning_asset_split_texts,
            update_extract,
            update_card,
            update_interval_multiplier,
            // Trash
            trash_element,
            trash_elements_bulk,
            restore_element,
            get_trash,
            delete_element_permanently,
            empty_trash,
            // Study
            get_card_review,
            get_learning_asset_review,
            get_due_elements,
            register_card_review,
            get_card_scheduling,
            next_learning_asset,
            preview_next_learning_asset,
            finish_learning_asset,
            unfinish_learning_asset,
            finish_learning_assets_bulk,
            unfinish_learning_assets_bulk,
            reset_repetitions_bulk,
            get_fuzz_factor,
            set_fuzz_factor,
            // Study profiles
            list_study_profiles,
            create_study_profile,
            update_study_profile,
            delete_study_profile,
            clone_study_profile,
            set_default_study_profile,
            assign_study_profile,
            assign_study_profile_bulk,
            get_effective_study_profile,
            // Bibliographical sources
            list_bibliographical_sources,
            get_bibliographical_source,
            create_bibliographical_source,
            update_bibliographical_source,
            delete_bibliographical_source,
            assign_bibliographical_source,
            assign_bibliographical_source_bulk,
            // Saved searches
            list_saved_searches,
            get_saved_search_filters,
            create_saved_search,
            rename_saved_search,
            update_saved_search_filters,
            duplicate_saved_search,
            delete_saved_search,
            // Search
            search_elements,
            // Import
            fetch_page,
            fetch_image,
            extract_pdf,
            extract_epub,
            // App Info
            is_store_installed,
            // AI
            create_ai_chat,
            stream_ai_response,
            stop_ai_generation,
            get_all_ai_chats_sorted_by_date_desc,
            delete_ai_chat,
            get_chat_messages_ordered,
            rename_ai_chat,
            upload_document,
            // Sync
            sync,
            // Common
            resolve_frontend_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
