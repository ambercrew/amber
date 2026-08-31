use crate::common::api_error::ApiError;
use crate::settings::value_objects::theme::Theme;
use crate::system_chrome::plugin::apply_theme;

#[tauri::command]
pub fn set_system_chrome_theme<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    theme: Theme,
) -> Result<(), ApiError> {
    apply_theme(&app, theme)
}

#[cfg(test)]
mod tests {
    use super::Theme;

    #[test]
    fn set_system_chrome_theme_payload_serializes_settings_theme_as_is() {
        // Arrange

        // Act

        let dark = serde_json::to_string(&Theme::Dark).unwrap();
        let light = serde_json::to_string(&Theme::Light).unwrap();
        let follow_system = serde_json::to_string(&Theme::FollowSystem).unwrap();

        // Assert

        assert_eq!(dark, "\"Dark\"");
        assert_eq!(light, "\"Light\"");
        assert_eq!(follow_system, "\"FollowSystem\"");
    }
}
