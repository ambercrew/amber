use crate::elements::value_objects::element_id::ElementId;

/// Rendered by the frontend as a link to the element; keep in sync with `elementReference.ts`.
pub const ELEMENT_REFERENCE_TAG: &str = "element-ref";

/// Markdown linking to an element, which the frontend labels with its current name.
pub fn element_reference(element_id: ElementId) -> String {
    let value = serde_json::to_value(element_id).expect("an ElementId always serializes");
    let element_type = value["type"].as_str().unwrap_or_default();
    format!(
        r#"<{ELEMENT_REFERENCE_TAG} data-type="{element_type}" data-id="{}"></{ELEMENT_REFERENCE_TAG}>"#,
        element_id.id().hyphenated()
    )
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    fn element_reference_learning_asset_tag_with_camel_case_type_and_hyphenated_id() {
        // Arrange

        let id = Uuid::new_v4();

        // Act

        let actual = element_reference(ElementId::LearningAsset(id));

        // Assert

        assert_eq!(
            format!(
                r#"<element-ref data-type="learningAsset" data-id="{}"></element-ref>"#,
                id.hyphenated()
            ),
            actual
        );
    }
}
