use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::settings::value_objects::{
    ai_provider::AiProvider, ai_provider_settings::AiProviderSettings,
    database_location::DatabaseLocation, font::Font, settings_profile::SettingsProfile,
    theme::Theme,
};
use crate::trash::services::trash_service::DEFAULT_TRASH_RETENTION_DAYS;

#[cfg(not(debug_assertions))]
const DATABASE_FILE_NAME: &str = "amber.db";
#[cfg(debug_assertions)]
const DATABASE_FILE_NAME: &str = "amber.dev.db";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub(in crate::settings) base_database_directory: PathBuf,
    pub(in crate::settings) profile: SettingsProfile,

    pub theme: Theme,
    #[serde(default)]
    pub font: Font,
    #[serde(default)]
    pub font_headings: Font,
    #[serde(default)]
    pub font_monospace: Font,
    pub zoom_percentage: f64,
    pub auto_sync: bool,

    /// How many days elements stay in the trash before they are purged.
    /// Defaulted so a settings file written before the trash existed still
    /// parses instead of taking the whole app down on startup.
    #[serde(default = "default_trash_retention_days")]
    pub trash_retention_days: u32,

    #[serde(default = "default_enable_ai")]
    pub enable_ai: bool,
    #[serde(default)]
    pub ai_provider: AiProvider,
    /// Per-provider settings, keyed by provider; a missing entry means defaults.
    #[serde(default)]
    pub ai_providers: HashMap<AiProvider, AiProviderSettings>,
}

/// Top-level keys that older settings files used for per-provider settings,
/// before they moved under `aiProviders`.
const LEGACY_AI_PROVIDER_KEYS: [(&str, AiProvider); 3] = [
    ("ollama", AiProvider::Ollama),
    ("openai", AiProvider::OpenAI),
    ("openrouter", AiProvider::OpenRouter),
];

fn migrate_legacy_ai_providers(value: &mut Value) -> serde_json::Result<()> {
    let Some(object) = value.as_object_mut() else {
        return Ok(());
    };

    let mut ai_providers: HashMap<AiProvider, AiProviderSettings> = match object.get("aiProviders")
    {
        Some(existing) => serde_json::from_value(existing.clone())?,
        None => HashMap::new(),
    };
    for (key, provider) in LEGACY_AI_PROVIDER_KEYS {
        if let Some(legacy) = object.remove(key) {
            let legacy = serde_json::from_value(legacy)?;
            ai_providers.entry(provider).or_insert(legacy);
        }
    }
    object.insert("aiProviders".into(), serde_json::to_value(ai_providers)?);

    Ok(())
}

fn default_trash_retention_days() -> u32 {
    DEFAULT_TRASH_RETENTION_DAYS
}

fn default_enable_ai() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            base_database_directory: PathBuf::default(),
            profile: SettingsProfile::default(),
            theme: Theme::default(),
            font: Font::default(),
            font_headings: Font::default(),
            font_monospace: Font::default(),
            zoom_percentage: f64::default(),
            auto_sync: bool::default(),
            trash_retention_days: DEFAULT_TRASH_RETENTION_DAYS,
            enable_ai: true,
            ai_provider: AiProvider::default(),
            ai_providers: HashMap::new(),
        }
    }
}

impl Settings {
    /// Parses a settings file, migrating legacy fields to their current shape first.
    pub fn from_json(json: &str) -> serde_json::Result<Self> {
        let mut value: Value = serde_json::from_str(json)?;
        migrate_legacy_ai_providers(&mut value)?;
        serde_json::from_value(value)
    }

    /// The settings of `provider`, or its defaults if none were saved.
    pub fn ai_provider_settings(&self, provider: AiProvider) -> AiProviderSettings {
        self.ai_providers
            .get(&provider)
            .cloned()
            .unwrap_or_default()
    }

    pub fn new(base_database_location: PathBuf, profile: SettingsProfile) -> Self {
        Settings {
            base_database_directory: base_database_location,
            profile,
            theme: Theme::FollowSystem,
            font: Font::SystemDefault,
            font_headings: Font::SystemDefault,
            font_monospace: Font::SystemDefault,
            zoom_percentage: 100f64,
            auto_sync: true,
            trash_retention_days: DEFAULT_TRASH_RETENTION_DAYS,
            enable_ai: true,
            ai_provider: AiProvider::default(),
            ai_providers: HashMap::new(),
        }
    }

    /// The directory that contains the database file.
    pub fn database_directory(&self) -> PathBuf {
        match &self.profile {
            SettingsProfile::Default => self.base_database_directory.clone(),
            SettingsProfile::User(user) => self.base_database_directory.join(user),
        }
    }

    /// The full path to where the database is.
    pub fn database_location(&self) -> DatabaseLocation {
        DatabaseLocation(self.database_directory().join(DATABASE_FILE_NAME))
    }

    pub fn base_database_directory_as_string(&self) -> String {
        self.base_database_directory.to_string_lossy().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn database_directory_default_profile_returned_base_directory() {
        // Arrange

        let base = PathBuf::from("/data/amber");
        let settings = Settings::new(base.clone(), SettingsProfile::Default);

        // Act

        let actual = settings.database_directory();

        // Assert

        assert_eq!(base, actual);
    }

    #[test]
    pub fn database_directory_user_profile_returned_correct_directory() {
        // Arrange

        let base = PathBuf::from("/data/amber");
        let settings = Settings::new(base.clone(), SettingsProfile::User("user1".into()));

        // Act

        let actual = settings.database_directory();

        // Assert

        assert_eq!(base.join("user1"), actual);
    }

    #[test]
    pub fn from_json_legacy_provider_fields_migrated_to_ai_providers() {
        // Arrange

        let json = r#"{
            "baseDatabaseDirectory": "/data/amber",
            "profile": "Default",
            "theme": "FollowSystem",
            "zoomPercentage": 100.0,
            "autoSync": true,
            "aiProvider": "openRouter",
            "ollama": { "modelName": "llama3.1", "embeddingsModelName": null, "apiKey": null },
            "openai": { "modelName": "gpt-4o", "embeddingsModelName": null, "apiKey": null },
            "openrouter": { "modelName": "openai/gpt-4o-mini", "embeddingsModelName": null, "apiKey": null }
        }"#;

        // Act

        let actual = Settings::from_json(json).unwrap();

        // Assert

        assert_eq!(AiProvider::OpenRouter, actual.ai_provider);
        assert_eq!(
            Some("llama3.1".to_string()),
            actual.ai_provider_settings(AiProvider::Ollama).model_name
        );
        assert_eq!(
            Some("gpt-4o".to_string()),
            actual.ai_provider_settings(AiProvider::OpenAI).model_name
        );
        assert_eq!(
            Some("openai/gpt-4o-mini".to_string()),
            actual
                .ai_provider_settings(AiProvider::OpenRouter)
                .model_name
        );
        assert_eq!(
            None,
            actual.ai_provider_settings(AiProvider::Gemini).model_name
        );
    }

    #[test]
    pub fn from_json_serialized_settings_round_tripped_ai_providers() {
        // Arrange

        let mut settings = Settings::new(PathBuf::from("/data/amber"), SettingsProfile::Default);
        settings.ai_providers.insert(
            AiProvider::Gemini,
            AiProviderSettings {
                model_name: Some("gemini-2.5-flash".to_string()),
                ..Default::default()
            },
        );
        let json = serde_json::to_string(&settings).unwrap();

        // Act

        let actual = Settings::from_json(&json).unwrap();

        // Assert

        assert_eq!(
            Some("gemini-2.5-flash".to_string()),
            actual.ai_provider_settings(AiProvider::Gemini).model_name
        );
    }
}
