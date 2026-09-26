use crate::saved_searches::entities::saved_search_filter::SavedSearchFilter;

pub struct SavedSearchFilterRow {
    pub index: i64,
    pub filter: String,
}

impl SavedSearchFilterRow {
    /// `None` for a filter this build can't parse, e.g. a newer filter type synced from another device.
    pub fn into_filter(self) -> Option<SavedSearchFilter> {
        match serde_json::from_str(&self.filter) {
            Ok(filter) => Some(SavedSearchFilter {
                index: self.index,
                filter,
            }),
            Err(error) => {
                log::warn!("Skipping unreadable saved search filter: {error}");
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn into_filter_unknown_filter_field_returns_none() {
        // Arrange

        let row = SavedSearchFilterRow {
            index: 0,
            filter: r#"{"field":"fromTheFuture","id":"00000000-0000-0000-0000-000000000000"}"#
                .into(),
        };

        // Act

        let actual = row.into_filter();

        // Assert

        assert_eq!(None, actual);
    }
}
