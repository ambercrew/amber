use uuid::Uuid;

/// A JSON array of hyphenated ids, for binding a list to `json_each`.
pub fn ids_json(ids: impl IntoIterator<Item = Uuid>) -> String {
    serde_json::to_string(
        &ids.into_iter()
            .map(|id| id.hyphenated().to_string())
            .collect::<Vec<_>>(),
    )
    .expect("a list of strings always serializes")
}
