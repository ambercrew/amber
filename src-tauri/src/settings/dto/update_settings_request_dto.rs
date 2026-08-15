use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::settings::value_objects::{
    ai_provider::AiProvider, ai_provider_settings::AiProviderSettings, font::Font,
    settings_profile::SettingsProfile, theme::Theme,
};

#[derive(Default, Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsRequestDto {
    pub base_database_directory: Option<PathBuf>,
    pub profile: Option<SettingsProfile>,

    pub theme: Option<Theme>,
    pub font: Option<Font>,
    pub font_headings: Option<Font>,
    pub font_monospace: Option<Font>,
    pub zoom_percentage: Option<f64>,
    pub auto_sync: Option<bool>,
    pub trash_retention_days: Option<u32>,

    pub enable_ai: Option<bool>,
    pub ai_provider: Option<AiProvider>,
    pub ollama: Option<AiProviderSettings>,
    pub openai: Option<AiProviderSettings>,
}
