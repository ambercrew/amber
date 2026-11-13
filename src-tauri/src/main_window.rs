use tauri::{App, WebviewWindowBuilder};

use crate::AppRuntime;

// Alloy style has no Chrome accelerators, so F12 is scripted; the runtime already scripts Ctrl+Shift+I.
#[cfg(all(feature = "cef", debug_assertions))]
const F12_DEVTOOLS_SCRIPT: &str = r#"
document.addEventListener("keydown", event => {
    if (event.key !== "F12" || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    window.__TAURI_INTERNALS__.invoke("plugin:webview|internal_toggle_devtools");
});
"#;

/// Builds the config's windows, which set `"create": false` so the CEF build can pick its runtime style.
pub fn create_config_windows(app: &App<AppRuntime>) -> tauri::Result<()> {
    for config in app.config().app.windows.clone() {
        let builder = WebviewWindowBuilder::from_config(app, &config)?;
        // Chrome style reserves Ctrl+N, Ctrl+Shift+N, Ctrl+T and Ctrl+W, so the page would never see them.
        #[cfg(feature = "cef")]
        let builder = {
            use tauri_runtime_cef::{RuntimeStyle, WebviewWindowBuilderCefExt};
            builder.browser_runtime_style(RuntimeStyle::Alloy)
        };
        #[cfg(all(feature = "cef", debug_assertions))]
        let builder = builder.initialization_script(F12_DEVTOOLS_SCRIPT);
        builder.build()?;
    }
    Ok(())
}
