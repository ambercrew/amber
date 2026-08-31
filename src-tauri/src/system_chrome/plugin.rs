use crate::common::api_error::ApiError;
use crate::settings::value_objects::theme::Theme;

/// Holds the Android plugin handle used to forward theme changes to
/// `SystemChromePlugin` on the Kotlin side.
#[cfg(target_os = "android")]
pub struct AndroidSystemChrome<R: tauri::Runtime>(pub tauri::plugin::PluginHandle<R>);

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("system-chrome")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;

                let handle =
                    api.register_android_plugin("dev.amberapp.amber", "SystemChromePlugin")?;
                app.manage(AndroidSystemChrome(handle));
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

/// Applies `theme` to the OS-level chrome of the app (desktop window theme,
/// Android system bars). A no-op on platforms without controllable chrome.
pub fn apply_theme<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    theme: Theme,
) -> Result<(), ApiError> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    apply_desktop(app, theme)?;

    #[cfg(target_os = "android")]
    apply_android(app, theme)?;

    #[cfg(target_os = "ios")]
    let _ = (app, theme);

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_desktop<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    theme: Theme,
) -> Result<(), ApiError> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window
        .set_theme(match theme {
            Theme::Dark => Some(tauri::Theme::Dark),
            Theme::Light => Some(tauri::Theme::Light),
            Theme::FollowSystem => None,
        })
        .map_err(|e| ApiError::new(e.to_string()))
}

#[cfg(target_os = "android")]
fn apply_android<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    theme: Theme,
) -> Result<(), ApiError> {
    use tauri::Manager;

    let Some(handle) = app.try_state::<AndroidSystemChrome<R>>() else {
        return Err(ApiError::new(
            "The system chrome plugin is not registered.".to_owned(),
        ));
    };

    let _: serde_json::Value = handle
        .0
        .run_mobile_plugin("setTheme", serde_json::json!({ "theme": theme }))
        .map_err(|e| ApiError::new(e.to_string()))?;
    Ok(())
}
