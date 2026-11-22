use serde::{Deserialize, Serialize};

/// The webview's default font, or a family installed on this machine (from `SystemFontsProvider`),
/// stored by name as installed fonts vary per machine.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum Font {
    #[default]
    SystemDefault,
    Named(String),
}
