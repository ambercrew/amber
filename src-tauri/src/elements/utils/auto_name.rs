use chrono::{DateTime, Local, Utc};

use crate::elements::utils::plain_text_extractor::extract_plain_text_hiding_clozes;

/// Longest automatic name, cut back to the last whole word.
const AUTO_NAME_MAX_LENGTH: usize = 50;
const CLOZE_PLACEHOLDER: &str = "...";

/// A name for an element the user hasn't named: the first words of the first non-empty
/// Lexical `contents`, with hidden clozes as `...`, else the local date and time it was created.
pub fn auto_name(contents: &[&str], created_at: DateTime<Utc>) -> String {
    contents
        .iter()
        .map(|content| {
            let text = extract_plain_text_hiding_clozes(content, CLOZE_PLACEHOLDER);
            text.split_whitespace().collect::<Vec<_>>().join(" ")
        })
        .find(|text| !text.is_empty())
        .map(|text| truncate_to_words(&text))
        .unwrap_or_else(|| {
            created_at
                .with_timezone(&Local)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        })
}

fn truncate_to_words(text: &str) -> String {
    if text.chars().count() <= AUTO_NAME_MAX_LENGTH {
        return text.to_string();
    }
    let truncated: String = text.chars().take(AUTO_NAME_MAX_LENGTH + 1).collect();
    // A word ending exactly at the limit still counts as whole.
    match truncated.rfind(' ') {
        Some(last_space) if last_space > 0 => truncated[..last_space].to_string(),
        _ => truncated.chars().take(AUTO_NAME_MAX_LENGTH).collect(),
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn paragraph(text: &str) -> String {
        format!(
            r#"{{"root":{{"children":[{{"type":"paragraph","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
        )
    }

    #[test]
    fn auto_name_short_content_returns_whole_text() {
        // Arrange

        let content = paragraph("Photosynthesis basics");

        // Act

        let actual = auto_name(&[&content], Utc::now());

        // Assert

        assert_eq!("Photosynthesis basics", actual);
    }

    #[test]
    fn auto_name_long_content_returns_whole_words_within_limit() {
        // Arrange

        let content = paragraph(
            "The mitochondria is the powerhouse of the cell and produces most of its energy",
        );

        // Act

        let actual = auto_name(&[&content], Utc::now());

        // Assert

        assert_eq!("The mitochondria is the powerhouse of the cell and", actual);
    }

    #[test]
    fn auto_name_hidden_cloze_returns_ellipsis_in_its_place() {
        // Arrange

        let content = r#"{"root":{"children":[{"type":"paragraph","children":[
            {"type":"text","text":"The capital of France is "},
            {"type":"cloze-hidden","text":"[...]","hiddenText":"Paris"}
        ]}]}}"#;

        // Act

        let actual = auto_name(&[content], Utc::now());

        // Assert

        assert_eq!("The capital of France is ...", actual);
    }

    #[test]
    fn auto_name_multiple_blocks_returns_single_line() {
        // Arrange

        let content = r#"{"root":{"children":[
            {"type":"heading","children":[{"type":"text","text":"Title"}]},
            {"type":"paragraph","children":[{"type":"text","text":"Body"}]}
        ]}}"#;

        // Act

        let actual = auto_name(&[content], Utc::now());

        // Assert

        assert_eq!("Title Body", actual);
    }

    #[test]
    fn auto_name_first_content_empty_returns_next_contents_text() {
        // Arrange

        let back = paragraph("Answer");

        // Act

        let actual = auto_name(&["", &back], Utc::now());

        // Assert

        assert_eq!("Answer", actual);
    }

    #[test]
    fn auto_name_empty_content_returns_local_creation_date_and_time() {
        // Arrange

        let created_at = Local
            .with_ymd_and_hms(2026, 3, 14, 12, 30, 45)
            .unwrap()
            .with_timezone(&Utc);
        let empty = r#"{"root":{"children":[{"type":"paragraph","children":[]}]}}"#;

        // Act

        let actual = auto_name(&[empty, ""], created_at);

        // Assert

        assert_eq!("2026-03-14 12:30:45", actual);
    }
}
