use serde::{Deserialize, Serialize};

/// Either the OS/webview default font, or a specific font family installed
/// on the user's machine (as reported by `SystemFontsProvider`). System fonts
/// vary per machine, so this stores the family name rather than a fixed set
/// of options.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum Font {
    #[default]
    SystemDefault,
    Named(String),
}
