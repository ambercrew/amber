use async_trait::async_trait;

#[async_trait]
pub trait SystemFontsProvider: Send + Sync {
    /// The distinct font family names installed on the user's machine,
    /// sorted alphabetically.
    async fn list_system_fonts(&self) -> Vec<String>;
}
