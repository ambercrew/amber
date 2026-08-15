use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::settings::services::system_fonts_provider::SystemFontsProvider;

#[derive(ScopeInjectable)]
pub struct DefaultSystemFontsProvider {}

#[async_trait]
impl SystemFontsProvider for DefaultSystemFontsProvider {
    async fn list_system_fonts(&self) -> Vec<String> {
        // Scanning font directories can take a noticeable amount of time, so
        // it's run on a blocking thread rather than the async runtime.
        tokio::task::spawn_blocking(|| {
            let mut db = fontdb::Database::new();
            db.load_system_fonts();

            let mut families: Vec<String> = db
                .faces()
                .flat_map(|face| face.families.iter().map(|(name, _)| name.clone()))
                .collect();
            families.sort();
            families.dedup();
            families
        })
        .await
        .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn list_system_fonts_called_returned_sorted_distinct_families() {
        // Arrange

        let provider = DefaultSystemFontsProvider {};

        // Act

        let actual = provider.list_system_fonts().await;

        // Assert

        let mut expected = actual.clone();
        expected.sort();
        expected.dedup();
        assert_eq!(expected, actual);
    }
}
