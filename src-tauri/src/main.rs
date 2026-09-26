// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tokio::main]
#[cfg_attr(feature = "cef", tauri_runtime_cef::cef_entry_point)]
async fn main() {
    amber_app_lib::run().await;
}
