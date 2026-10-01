use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::settings::{
    dto::ai_provider_settings_dto::AiProviderSettingsDto,
    value_objects::{ai_provider::AiProvider, font::Font, theme::Theme},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub base_database_directory: String,

    pub theme: Theme,
    pub font: Font,
    pub font_headings: Font,
    pub font_monospace: Font,
    pub zoom_percentage: f64,
    pub auto_sync: bool,
    pub trash_retention_days: u32,

    pub enable_ai: bool,
    pub ai_provider: AiProvider,
    /// Holds an entry for every provider.
    pub ai_providers: HashMap<AiProvider, AiProviderSettingsDto>,
}
