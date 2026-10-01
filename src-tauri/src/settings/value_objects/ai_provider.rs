use std::fmt::Display;

use serde::{Deserialize, Serialize};

#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiProvider {
    #[default]
    Ollama,
    OpenAI,
    OpenRouter,
    Gemini,
}

impl AiProvider {
    pub const ALL: [AiProvider; 4] = [
        AiProvider::Ollama,
        AiProvider::OpenAI,
        AiProvider::OpenRouter,
        AiProvider::Gemini,
    ];

    /// The OS secret-store key holding this provider's API key, or `None` if it takes no key.
    pub fn api_key_secret(&self) -> Option<&'static str> {
        match self {
            AiProvider::Ollama => None,
            AiProvider::OpenAI => Some("openai_api_key"),
            AiProvider::OpenRouter => Some("openrouter_api_key"),
            AiProvider::Gemini => Some("gemini_api_key"),
        }
    }
}

impl Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            AiProvider::Ollama => "Ollama",
            AiProvider::OpenAI => "OpenAI",
            AiProvider::OpenRouter => "OpenRouter",
            AiProvider::Gemini => "Gemini",
        };
        f.write_str(name)
    }
}
